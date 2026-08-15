// Prevents additional console window on Windows in release builds, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!()).expect("Error running tauri application");
}