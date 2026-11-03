//! Windows Job Object Process Supervisor & Ephemeral Loopback IPC Handshake.
//!
//! Guarantees zero zombie `bluetrace-core.exe` processes on Windows by assigning
//! the Python sidecar handle to a kernel Job Object configured with
//! `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Also negotiates dynamic ephemeral ports
//! (`127.0.0.1:0`) and HMAC-SHA256 bearer tokens over stdout.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};

pub const EPHEMERAL_BIND_HOST: &str = "127.0.0.1";
pub const EPHEMERAL_BIND_PORT: u16 = 0;
pub const HANDSHAKE_STATUS_READY: &str = "READY";
pub const MIN_TOKEN_LEN: usize = 16;

/// Structured JSON handshake emitted by `bluetrace-core.exe` on stdout once Uvicorn binds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SidecarHandshake {
    pub status: String,
    pub port: u16,
    pub token: String,
    #[serde(default)]
    pub pid: Option<u32>,
}

/// Configuration object injected into `window.__BLUETRACE_CONFIG__` inside WebView2.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFrontendConfig {
    pub api_url: String,
    pub auth_token: String,
    pub app_version: String,
    pub platform: String,
}

/// Parses and validates a single stdout line looking for the `READY` JSON handshake.
pub fn parse_handshake_line(line: &str) -> Result<SidecarHandshake, String> {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return Err("Line is not a JSON object".to_string());
    }

    let handshake: SidecarHandshake = serde_json::from_str(trimmed)
        .map_err(|e| format!("Invalid handshake JSON payload: {e}"))?;

    if handshake.status != HANDSHAKE_STATUS_READY {
        return Err(format!(
            "Unexpected handshake status '{}', expected '{}'",
            handshake.status, HANDSHAKE_STATUS_READY
        ));
    }

    if handshake.port == 0 {
        return Err("Handshake port must be a non-zero kernel-assigned ephemeral port".to_string());
    }

    if handshake.token.trim().len() < MIN_TOKEN_LEN {
        return Err(format!(
            "Handshake token fails minimum cryptographic length ({MIN_TOKEN_LEN} chars)"
        ));
    }

    Ok(handshake)
}

/// Builds the `DesktopFrontendConfig` from a verified `SidecarHandshake`.
pub fn build_frontend_config(
    handshake: &SidecarHandshake,
    app_version: &str,
) -> DesktopFrontendConfig {
    DesktopFrontendConfig {
        api_url: format!("http://{}:{}/api", EPHEMERAL_BIND_HOST, handshake.port),
        auth_token: handshake.token.clone(),
        app_version: app_version.to_string(),
        platform: "windows".to_string(),
    }
}

/// Builds the JavaScript snippet injected into the WebView2 DOM before navigation.
pub fn build_webview_init_script(
    handshake: &SidecarHandshake,
    app_version: &str,
) -> Result<String, String> {
    let cfg = build_frontend_config(handshake, app_version);
    let serialized = serde_json::to_string(&cfg)
        .map_err(|e| format!("Failed to serialize frontend config: {e}"))?;
    Ok(format!("window.__BLUETRACE_CONFIG__ = {serialized};"))
}

#[cfg(windows)]
mod win_job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub const KILL_ON_JOB_CLOSE_FLAG: u32 = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

    pub struct JobObjectSupervisor {
        job_handle: HANDLE,
    }

    impl JobObjectSupervisor {
        pub fn new() -> Result<Self, String> {
            unsafe {
                // Create an anonymous Windows Job Object
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if job.is_null() {
                    return Err(format!(
                        "CreateJobObjectW failed with OS error: {}",
                        std::io::Error::last_os_error()
                    ));
                }

                // Configure the Job Object to terminate all assigned processes upon handle closure
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

                let result = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );

                if result == 0 {
                    CloseHandle(job);
                    return Err(format!(
                        "SetInformationJobObject failed with OS error: {}",
                        std::io::Error::last_os_error()
                    ));
                }

                Ok(Self { job_handle: job })
            }
        }

        pub fn assign_child(&self, child: &Child) -> Result<(), String> {
            let raw_handle = child.as_raw_handle() as HANDLE;
            unsafe {
                let result = AssignProcessToJobObject(self.job_handle, raw_handle);
                if result == 0 {
                    return Err(format!(
                        "AssignProcessToJobObject failed with OS error: {}",
                        std::io::Error::last_os_error()
                    ));
                }
            }
            Ok(())
        }
    }

    impl Drop for JobObjectSupervisor {
        fn drop(&mut self) {
            unsafe {
                if !self.job_handle.is_null() {
                    CloseHandle(self.job_handle);
                }
            }
        }
    }
}

#[cfg(windows)]
pub use win_job::{JobObjectSupervisor, KILL_ON_JOB_CLOSE_FLAG};

#[cfg(not(windows))]
pub const KILL_ON_JOB_CLOSE_FLAG: u32 = 0x0000_2000;

#[cfg(not(windows))]
pub struct JobObjectSupervisor;

#[cfg(not(windows))]
impl JobObjectSupervisor {
    pub fn new() -> Result<Self, String> {
        Ok(Self)
    }

    pub fn assign_child(&self, _child: &Child) -> Result<(), String> {
        Ok(())
    }
}

/// Spawns the `bluetrace-core.exe` sidecar bound to `127.0.0.1:0`, attaches it to the
/// Windows Job Object, and reads stdout until the `READY` handshake is emitted.
pub fn spawn_supervised_sidecar(
    sidecar_exe: &str,
    supervisor: &JobObjectSupervisor,
) -> Result<(Child, SidecarHandshake), String> {
    let mut child = Command::new(sidecar_exe)
        .env("HOST", EPHEMERAL_BIND_HOST)
        .env("PORT", EPHEMERAL_BIND_PORT.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar '{sidecar_exe}': {e}"))?;

    supervisor.assign_child(&child)?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture sidecar stdout pipe".to_string())?;

    let reader = BufReader::new(stdout);
    for line_result in reader.lines() {
        let line = line_result.map_err(|e| format!("Error reading sidecar stdout: {e}"))?;
        if let Ok(handshake) = parse_handshake_line(&line) {
            return Ok((child, handshake));
        }
    }

    let _ = child.kill();
    Err("Sidecar exited before emitting a valid READY handshake on stdout".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_supervisor_parses_valid_ready_handshake() {
        let raw = r#"{"status": "READY", "port": 54210, "token": "4f9a8c2e1b7d3f6a5e8c2d1a4b7e9f3a6c8e1d2b5f7a9c3e1b6d8f2a4c7e9b1d", "pid": 18452}"#;
        let parsed = parse_handshake_line(raw).expect("valid handshake should parse");
        assert_eq!(parsed.status, "READY");
        assert_eq!(parsed.port, 54210);
        assert_eq!(parsed.pid, Some(18452));
        assert_eq!(
            parsed.token,
            "4f9a8c2e1b7d3f6a5e8c2d1a4b7e9f3a6c8e1d2b5f7a9c3e1b6d8f2a4c7e9b1d"
        );
    }

    #[test]
    fn test_supervisor_rejects_zero_port_and_short_tokens() {
        let zero_port = r#"{"status": "READY", "port": 0, "token": "4f9a8c2e1b7d3f6a5e8c2d1a4b7e9f3a"}"#;
        assert!(parse_handshake_line(zero_port).is_err());

        let short_token = r#"{"status": "READY", "port": 54210, "token": "short"}"#;
        assert!(parse_handshake_line(short_token).is_err());

        let bad_status = r#"{"status": "BOOTING", "port": 54210, "token": "4f9a8c2e1b7d3f6a5e8c2d1a4b7e9f3a"}"#;
        assert!(parse_handshake_line(bad_status).is_err());
    }

    #[test]
    fn test_supervisor_builds_webview_injection_script() {
        let hs = SidecarHandshake {
            status: "READY".to_string(),
            port: 54210,
            token: "4f9a8c2e1b7d3f6a5e8c2d1a4b7e9f3a6c8e1d2b5f7a9c3e1b6d8f2a4c7e9b1d".to_string(),
            pid: Some(18452),
        };
        let script = build_webview_init_script(&hs, "1.0.0").expect("script should build");
        assert!(script.starts_with("window.__BLUETRACE_CONFIG__ = "));
        assert!(script.contains("\"apiUrl\":\"http://127.0.0.1:54210/api\""));
        assert!(script.contains("\"platform\":\"windows\""));
    }

    #[test]
    fn test_supervisor_kill_on_job_close_flag_constant() {
        // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE in Win32 API is 0x00002000
        assert_eq!(KILL_ON_JOB_CLOSE_FLAG, 0x0000_2000);
    }
}
