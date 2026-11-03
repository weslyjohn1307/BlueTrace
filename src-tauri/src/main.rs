// Prevents an extra console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use bluetrace_desktop_lib::{supervisor, verify_runtime_invariants, APP_VERSION};

fn main() {
    if let Err(err) = verify_runtime_invariants() {
        eprintln!("BlueTrace desktop runtime invariant check failed: {err}");
        std::process::exit(1);
    }

    // Ensure the Windows Job Object supervisor can be initialized cleanly
    let _job_supervisor = supervisor::JobObjectSupervisor::new()
        .expect("Failed to initialize Windows Job Object supervisor");

    println!(
        "BlueTrace AI Workstation v{} initialized (ephemeral host {}:{})",
        APP_VERSION,
        supervisor::EPHEMERAL_BIND_HOST,
        supervisor::EPHEMERAL_BIND_PORT
    );
}
