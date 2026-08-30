// Prevents additional console window on Windows in release builds, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod services;
mod models;
mod database;
mod platform;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::audit_log,
            commands::ping_host,
            commands::check_port,
            commands::whois_rdap,
            commands::traceroute,
            commands::inspect_npcap_availability,
            commands::get_pcap_interfaces,
            commands::start_packet_capture,
            commands::stop_packet_capture,
            commands::get_capture_metrics,
            commands::get_capture_engine_state,
        ])
        .run(tauri::generate_context!()).expect("Error running tauri application");
}