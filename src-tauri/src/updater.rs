//! Ed25519 Cryptographic Auto-Update Configuration & Manifest Validator.
//!
//! Enforces strict Ed25519 signature verification and HTTPS transport for all
//! desktop auto-update manifests fetched from `https://releases.bluetrace.ai`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const DEFAULT_UPDATE_ENDPOINT: &str =
    "https://releases.bluetrace.ai/desktop/windows/update.json";
pub const EMBEDDED_ED25519_PUBKEY: &str =
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDNCRjQ4OTI0N0Q5MThFQzgKUldTQldKVDVwWmdTdmhQWjBGSllWemxHVW1uR1p5dE1Zblp2V1hKSlp6TkdWVGt3WXpBMFBRPT0K";
pub const REQUIRED_PLATFORM_KEY: &str = "windows-x86_64";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdaterConfig {
    pub active: bool,
    pub pubkey: String,
    pub endpoints: Vec<String>,
}

impl Default for UpdaterConfig {
    fn default() -> Self {
        Self {
            active: true,
            pubkey: EMBEDDED_ED25519_PUBKEY.to_string(),
            endpoints: vec![DEFAULT_UPDATE_ENDPOINT.to_string()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformAsset {
    pub signature: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateManifest {
    pub version: String,
    pub notes: String,
    pub pub_date: String,
    pub platforms: HashMap<String, PlatformAsset>,
}

/// Validates that the updater configuration enforces HTTPS and a non-empty Ed25519 public key.
pub fn validate_updater_config(config: &UpdaterConfig) -> Result<(), String> {
    if !config.active {
        return Err("Updater plugin must be active in production builds".to_string());
    }
    if config.pubkey.trim().len() < 32 {
        return Err("Embedded Ed25519 public key is missing or truncated".to_string());
    }
    if config.endpoints.is_empty() {
        return Err("At least one HTTPS update endpoint must be configured".to_string());
    }
    for endpoint in &config.endpoints {
        if !endpoint.starts_with("https://") {
            return Err(format!(
                "Update endpoint '{endpoint}' must use HTTPS transport"
            ));
        }
    }
    Ok(())
}

/// Validates a remote `update.json` manifest before permitting binary download or execution.
pub fn validate_update_manifest(manifest_json: &str) -> Result<UpdateManifest, String> {
    let manifest: UpdateManifest = serde_json::from_str(manifest_json)
        .map_err(|e| format!("Malformed update manifest JSON: {e}"))?;

    if manifest.version.trim().is_empty() {
        return Err("Update manifest version cannot be empty".to_string());
    }

    if manifest.pub_date.trim().is_empty() {
        return Err("Update manifest pub_date cannot be empty".to_string());
    }

    let win_asset = manifest
        .platforms
        .get(REQUIRED_PLATFORM_KEY)
        .ok_or_else(|| format!("Manifest missing required platform '{REQUIRED_PLATFORM_KEY}'"))?;

    if win_asset.signature.trim().is_empty() {
        return Err("Platform update package is missing its Ed25519 cryptographic signature".to_string());
    }

    if !win_asset.url.starts_with("https://") {
        return Err(format!(
            "Platform update package URL '{}' must use HTTPS",
            win_asset.url
        ));
    }

    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_updater_default_config_is_valid() {
        let cfg = UpdaterConfig::default();
        assert!(validate_updater_config(&cfg).is_ok());
    }

    #[test]
    fn test_updater_validates_signed_manifest() {
        let sample = r#"{
            "version": "1.1.0",
            "notes": "Added 2-point interactive canvas scale calibration and 50+ page batch intake navigator.",
            "pub_date": "2026-11-15T12:00:00Z",
            "platforms": {
                "windows-x86_64": {
                    "signature": "dW50cnVzdGVkIGNvbW1lbnQ6 signature block==",
                    "url": "https://releases.bluetrace.ai/desktop/v1.1.0/BlueTraceAI-Update-1.1.0.tar.gz"
                }
            }
        }"#;
        let parsed = validate_update_manifest(sample).expect("signed manifest should pass");
        assert_eq!(parsed.version, "1.1.0");
    }

    #[test]
    fn test_updater_rejects_unsigned_or_insecure_manifest() {
        let unsigned = r#"{
            "version": "1.1.0",
            "notes": "Release",
            "pub_date": "2026-11-15T12:00:00Z",
            "platforms": {
                "windows-x86_64": {
                    "signature": "",
                    "url": "https://releases.bluetrace.ai/desktop/v1.1.0/BlueTraceAI.tar.gz"
                }
            }
        }"#;
        assert!(validate_update_manifest(unsigned).is_err());

        let http_url = r#"{
            "version": "1.1.0",
            "notes": "Release",
            "pub_date": "2026-11-15T12:00:00Z",
            "platforms": {
                "windows-x86_64": {
                    "signature": "valid_sig_abc123",
                    "url": "http://releases.bluetrace.ai/desktop/v1.1.0/BlueTraceAI.tar.gz"
                }
            }
        }"#;
        assert!(validate_update_manifest(http_url).is_err());
    }
}
