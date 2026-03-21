#![allow(dead_code)]

use tauri::Manager;

mod agent;
mod commands;
mod connectors;
mod db;
pub mod providers;
pub mod services;
mod scope;
mod settings;
mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Debug)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stderr),
                ])
                .build(),
        )
        .setup(|app| {
            let conn = db::init::init_db().expect("Failed to initialize database");
            app.manage(std::sync::Mutex::new(conn));
            app.manage(commands::ai::create_stream_sessions());
            app.manage(commands::ai::create_codex_state());
            settings::prompts::ensure_defaults();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::ai::chat,
            commands::ai::chat_stream,
            commands::ai::cancel_stream,
            commands::ai::list_ollama_models,
            commands::files::summarize_folder,
            commands::files::organize_downloads,
            commands::files::rename_file_with_ai,
            commands::attachments::attach_files,
            commands::attachments::list_attachments,
            commands::attachments::read_attachment_preview,
            commands::attachments::extract_attachment_text,
            commands::threads::create_folder,
            commands::threads::list_folders,
            commands::threads::delete_folder,
            commands::threads::create_thread,
            commands::threads::list_threads,
            commands::threads::delete_thread,
            commands::threads::archive_thread,
            commands::threads::unarchive_thread,
            commands::threads::list_archived_threads,
            commands::threads::update_thread_title,
            commands::threads::move_thread_to_folder,
            commands::threads::rename_folder,
            commands::threads::update_folder_appearance,
            commands::threads::update_folder_scope,
            commands::threads::update_thread_scope,
            commands::threads::resolve_effective_scope,
            commands::threads::pick_directory,
            commands::threads::pick_files,
            commands::threads::list_project_memories,
            commands::threads::pin_project_memory,
            commands::threads::append_thread_summary,
            commands::threads::send_message,
            commands::threads::list_messages,
            commands::skills::list_skills,
            commands::skills::read_skill,
            commands::skills::save_skill,
            commands::skills::create_skill,
            commands::skills::delete_skill,
            commands::skills::reset_skills,
            commands::memory::list_memory_files,
            commands::memory::read_memory_file,
            commands::memory::append_memory,
            commands::memory::clear_today_memory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
