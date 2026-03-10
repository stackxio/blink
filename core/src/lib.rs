use tauri::Manager;

mod agent;
mod ai;
mod commands;
mod connectors;
mod db;
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
            let conn = db::init::init_db().expect("Failed to initialize database");
            app.manage(std::sync::Mutex::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::ai::chat,
            commands::ai::chat_stream,
            commands::files::summarize_folder,
            commands::files::organize_downloads,
            commands::files::rename_file_with_ai,
            commands::threads::create_folder,
            commands::threads::list_folders,
            commands::threads::delete_folder,
            commands::threads::create_thread,
            commands::threads::list_threads,
            commands::threads::delete_thread,
            commands::threads::update_thread_title,
            commands::threads::send_message,
            commands::threads::list_messages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
