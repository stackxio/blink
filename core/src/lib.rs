mod agent;
mod ai;
mod commands;
mod connectors;
mod settings;
mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::ai::chat,
            commands::files::summarize_folder,
            commands::files::organize_downloads,
            commands::files::rename_file_with_ai,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
