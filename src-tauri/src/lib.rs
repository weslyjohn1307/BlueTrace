//! BlueTrace AI Desktop Host Library (Tauri v2).
//!
//! Coordinates the Windows Job Object process supervisor (`supervisor`),
//! Ed25519 cryptographic auto-updater (`updater`), and Microsoft Edge WebView2
//! window initialization.

pub mod supervisor;
pub mod updater;

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SIDECAR_BINARY_NAME: &str = "binaries/bluetrace-core.exe";

/// Validates the embedded updater configuration before initializing the Tauri shell.
pub fn verify_runtime_invariants() -> Result<(), String> {
    let updater_cfg = updater::UpdaterConfig::default();
    updater::validate_updater_config(&updater_cfg)
}
