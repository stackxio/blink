#![allow(dead_code)]

use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

mod commands;
mod connectors;
mod db;
pub mod lsp;
mod scope;
mod services;
mod settings;
pub mod tools;

/// Path passed as a CLI argument (e.g. `codrift ~/.zshrc`).
/// Stored here so the frontend can retrieve it once the window has loaded.
pub struct StartupPath(pub Option<String>);

#[tauri::command]
fn get_startup_path(state: tauri::State<'_, std::sync::Mutex<StartupPath>>) -> Option<String> {
    // Take the value so it's only returned once
    state.lock().unwrap().0.take()
}

#[tauri::command]
fn restart_for_update() {
    // Spawn the new process with CODRIFT_RELAUNCH=1 so it waits before acquiring
    // the single-instance lock (giving us time to fully release it).
    if let Ok(exe) = std::env::current_exe() {
        std::process::Command::new(exe)
            .env("CODRIFT_RELAUNCH", "1")
            .spawn()
            .ok();
    }
    // Exit immediately — releases the single-instance lock right away.
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // If this process was spawned by restart_for_update, the previous instance may
    // still be in the process of releasing its single-instance lock.  Waiting here,
    // *before* tauri::Builder (which initialises the single-instance plugin), gives
    // the old instance enough time to fully exit so we don't get a false "already
    // running" collision and end up with a frozen / stuck window.
    if std::env::var("CODRIFT_RELAUNCH").is_ok() {
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // Capture any file/folder path passed as the first CLI argument.
    // Filter out macOS process serial numbers (-psn_…) and other flags.
    let startup_path: Option<String> = std::env::args().skip(1).find(|a| !a.starts_with('-'));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // argv[1] might be a file path
            if let Some(file_path) = argv.get(1) {
                let path = file_path.clone();
                app.emit("open-file", path).ok();
            }
            // Focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                window.show().ok();
                window.set_focus().ok();
                window.unminimize().ok();
            }
        }))
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
            // Native macOS menu bar
            let about = AboutMetadataBuilder::new()
                .name(Some("Codrift"))
                .version(Some(env!("CARGO_PKG_VERSION")))
                .authors(Some(vec!["Voxire".to_string()]))
                .comments(Some("AI-first code editor"))
                .website(Some("https://voxire.com"))
                .build();

            let app_menu = SubmenuBuilder::new(app, "Codrift")
                .about(Some(about))
                .separator()
                .text("settings", "Settings...")
                .text("extensions", "Extensions...")
                .text("check_updates", "Check for Updates...")
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let go_to_file = tauri::menu::MenuItemBuilder::new("Go to File...")
                .id("go_to_file")
                .accelerator("CmdOrCtrl+P")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .text("new_file", "New File")
                .text("open_file", "Open...")
                .text("open_folder", "Open Folder...")
                .item(&go_to_file)
                .separator()
                .text("save", "Save")
                .separator()
                .text("close_editor", "Close Editor")
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .text("command_palette", "Command Palette...")
                .text("toggle_sidebar", "Toggle Sidebar")
                .text("toggle_terminal", "Toggle Terminal")
                .text("toggle_ai", "Toggle AI Panel")
                .separator()
                .text("explorer", "Explorer")
                .text("search", "Search")
                .text("source_control", "Source Control")
                .separator()
                .item(
                    &MenuItemBuilder::new("Inspect")
                        .id("inspect")
                        .accelerator("Alt+CmdOrCtrl+I")
                        .build(app)?,
                )
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .text("about", "About Codrift")
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(|app_handle, event| {
                let window = app_handle.get_webview_window("main");
                if let Some(window) = window {
                    let _ = match event.id().0.as_str() {
                        "settings" => window.eval("document.dispatchEvent(new CustomEvent('blink:navigate', {detail: '/settings'}))"),
                        "extensions" => window.eval("document.dispatchEvent(new CustomEvent('blink:navigate', {detail: '/extensions'}))"),
                        "command_palette" => window.eval("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'p', metaKey: true, shiftKey: true}))"),
                        "toggle_sidebar" => window.eval("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'b', metaKey: true}))"),
                        "toggle_terminal" => window.eval("document.dispatchEvent(new KeyboardEvent('keydown', {key: '`', ctrlKey: true}))"),
                        "toggle_ai" => window.eval("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'l', metaKey: true}))"),
                        "search" => window.eval("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'f', metaKey: true, shiftKey: true}))"),
                        "explorer" => window.eval("document.dispatchEvent(new CustomEvent('blink:sidebar-view', {detail: 'explorer'}))"),
                        "source_control" => window.eval("document.dispatchEvent(new CustomEvent('blink:sidebar-view', {detail: 'git'}))"),
                        "go_to_file" => window.eval("document.dispatchEvent(new CustomEvent('blink:file-search'))"),
                        "open_file" => window.eval("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'o', metaKey: true}))"),
                        "open_folder" => window.eval("document.dispatchEvent(new CustomEvent('blink:open-folder'))"),
                        "new_file" => window.eval("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'n', metaKey: true}))"),
                        "check_updates" => window.eval("document.dispatchEvent(new CustomEvent('codrift:check-updates'))"),
                        "inspect" => {
                            if window.is_devtools_open() {
                                window.close_devtools();
                            } else {
                                window.open_devtools();
                            }
                            Ok(())
                        }
                        _ => Ok(()),
                    };
                }
            });

            let conn = db::init::init_db().expect("Failed to initialize database");
            app.manage(std::sync::Mutex::new(conn));
            app.manage(std::sync::Mutex::new(StartupPath(startup_path)));
            app.manage(commands::terminal::create_terminal_state());
            app.manage(commands::vterm::create_vterm_state());
            app.manage(std::sync::Mutex::new(commands::watcher::WatcherState::new()));
            app.manage(lsp::manager::create_lsp_state());
            app.manage(commands::blink_code_bridge::bridge_state());
            settings::prompts::ensure_defaults();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_startup_path,
            restart_for_update,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::updater::check_for_update,
            commands::updater::install_update,
            commands::files::get_home_dir,
            commands::files::open_url,
            commands::files::show_quit_confirm,
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
            commands::skills::get_combined_skills,
            commands::editorconfig::read_editorconfig,
            commands::editor::is_dir,
            commands::editor::read_dir,
            commands::editor::read_dir_batch,
            commands::editor::read_file_content,
            commands::editor::read_file_base64,
            commands::editor::write_file_content,
            commands::editor::install_cli,
            commands::editor::list_all_files,
            commands::editor::open_file_dialog,
            commands::editor::open_folder_dialog,
            commands::editor::reveal_in_finder,
            commands::editor::delete_path,
            commands::editor::rename_path,
            commands::editor::move_path,
            commands::editor::create_file,
            commands::editor::create_directory,
            commands::editor::search_in_files,
            commands::editor::replace_in_files,
            commands::editor::read_workspace_config,
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::terminal::which_cli,
            commands::vterm::vterm_create,
            commands::vterm::vterm_write,
            commands::vterm::vterm_resize,
            commands::vterm::vterm_close,
            commands::vterm::vterm_snapshot,
            commands::workspaces::save_workspaces,
            commands::workspaces::load_workspaces,
            commands::lsp::lsp_start,
            commands::lsp::lsp_request,
            commands::lsp::lsp_notify,
            commands::lsp::lsp_stop,
            commands::lsp::lsp_list_installed,
            commands::lsp::lsp_list_all_servers,
            commands::lsp::lsp_install_server,
            commands::git::git_status,
            commands::git::git_diff,
            commands::git::git_branch,
            commands::git::git_branches,
            commands::git::git_log,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_commit,
            commands::git::git_generate_commit_message,
            commands::git::git_checkout_branch,
            commands::git::git_push,
            commands::git::git_pull,
            commands::git::git_create_branch,
            commands::git::git_blame_line,
            commands::git::git_show,
            commands::git::git_file_at_head,
            commands::git::git_diff_file,
            commands::git::git_stage_hunk,
            commands::git::git_stash_list,
            commands::git::git_stash_push,
            commands::git::git_stash_pop,
            commands::git::git_stash_drop,
            commands::local_history::create_local_history_entry,
            commands::local_history::list_local_history,
            commands::local_history::read_local_history_entry,
            commands::local_history::clear_local_history_for_file,
            commands::watcher::start_watching,
            commands::watcher::stop_watching,
            commands::tools::tool_list,
            commands::tools::tool_execute,
            commands::blink_code_bridge::blink_code_bridge_start,
            commands::blink_code_bridge::blink_code_bridge_start_with_init,
            commands::blink_code_bridge::blink_code_bridge_send,
            commands::blink_code_bridge::blink_code_bridge_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
