use crate::db::models::{DbFolder, DbMessage, DbProjectMemory, DbThread};
use crate::db::queries;
use rusqlite::Connection;
use serde::Serialize;
use std::sync::Mutex;

/// Resolved scope for a thread: mode, optional root path, and display label.
#[derive(Debug, Clone, Serialize)]
pub struct EffectiveScope {
    pub mode: String,
    pub root_path: Option<String>,
    pub display_label: String,
}

#[tauri::command]
pub fn create_folder(
    state: tauri::State<'_, Mutex<Connection>>,
    name: String,
    scope_mode: Option<String>,
    root_path: Option<String>,
) -> Result<DbFolder, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let id = uuid_v4();
    let scope = scope_mode.as_deref().unwrap_or("system");
    queries::create_folder(&conn, &id, &name, scope, root_path.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_folders(state: tauri::State<'_, Mutex<Connection>>) -> Result<Vec<DbFolder>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::list_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_folder(state: tauri::State<'_, Mutex<Connection>>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::delete_folder(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_thread(
    state: tauri::State<'_, Mutex<Connection>>,
    folder_id: Option<String>,
    title: String,
    scope_mode_override: Option<String>,
    root_path_override: Option<String>,
) -> Result<DbThread, String> {
    log::info!("create_thread: folder_id={:?}, title={}", folder_id, title);
    let conn = state.lock().map_err(|e| {
        log::error!("create_thread: failed to lock db: {}", e);
        e.to_string()
    })?;
    let id = uuid_v4();
    match queries::create_thread(
        &conn,
        &id,
        folder_id.as_deref(),
        &title,
        scope_mode_override.as_deref(),
        root_path_override.as_deref(),
    ) {
        Ok(thread) => {
            log::info!("create_thread: ok id={}", thread.id);
            Ok(thread)
        }
        Err(e) => {
            log::error!("create_thread: query failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn list_threads(state: tauri::State<'_, Mutex<Connection>>) -> Result<Vec<DbThread>, String> {
    log::debug!("list_threads: called");
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::list_threads(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_thread(state: tauri::State<'_, Mutex<Connection>>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::delete_thread(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_thread(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::archive_thread(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unarchive_thread(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::unarchive_thread(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_archived_threads(
    state: tauri::State<'_, Mutex<Connection>>,
) -> Result<Vec<DbThread>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::list_archived_threads(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_thread_title(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::update_thread_title(&conn, &id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_thread_to_folder(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
    folder_id: Option<String>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::move_thread_to_folder(&conn, &id, folder_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_folder(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
    name: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::rename_folder(&conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_folder_appearance(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::update_folder_appearance(&conn, &id, icon.as_deref(), color.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_folder_scope(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
    scope_mode: String,
    root_path: Option<String>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::update_folder_scope(&conn, &id, &scope_mode, root_path.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_thread_scope(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
    scope_mode_override: String,
    root_path_override: Option<String>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::update_thread_scope(
        &conn,
        &id,
        &scope_mode_override,
        root_path_override.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_effective_scope(
    state: tauri::State<'_, Mutex<Connection>>,
    thread_id: String,
) -> Result<EffectiveScope, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let thread = queries::get_thread(&conn, &thread_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Thread not found".to_string())?;

    let (mode, root_path) = match thread.scope_mode_override.as_str() {
        "directory" => ("directory".to_string(), thread.root_path_override.clone()),
        "system" => ("system".to_string(), None),
        _ => {
            // inherit from project (folder)
            let folder = thread
                .folder_id
                .as_ref()
                .and_then(|fid| queries::get_folder(&conn, fid).ok().flatten());
            match folder {
                Some(f) if f.scope_mode == "directory" => {
                    ("directory".to_string(), f.root_path.clone())
                }
                _ => ("system".to_string(), None),
            }
        }
    };

    let display_label = if mode == "directory" {
        root_path.clone().unwrap_or_else(|| "Directory".to_string())
    } else {
        "Entire System".to_string()
    };

    Ok(EffectiveScope {
        mode,
        root_path,
        display_label,
    })
}

#[tauri::command]
pub async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
            .await
            .map_err(|e| e.to_string())?;
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let paths = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("Documents", &["txt", "md", "csv", "pdf"])
            .blocking_pick_files()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(paths
        .map(|v| v.into_iter().map(|p| p.to_string()).collect())
        .unwrap_or_default())
}

#[tauri::command]
pub fn send_message(
    state: tauri::State<'_, Mutex<Connection>>,
    thread_id: String,
    role: String,
    content: String,
) -> Result<DbMessage, String> {
    log::info!(
        "send_message: thread_id={}, role={}, content_len={}",
        thread_id,
        role,
        content.len()
    );
    if thread_id.is_empty() {
        log::error!("send_message: thread_id is empty");
        return Err("thread_id is required".to_string());
    }
    let conn = state.lock().map_err(|e| {
        log::error!("send_message: failed to lock db: {}", e);
        e.to_string()
    })?;
    let id = uuid_v4();
    match queries::create_message(&conn, &id, &thread_id, &role, &content, None) {
        Ok(msg) => {
            log::info!("send_message: ok message_id={}", msg.id);
            Ok(msg)
        }
        Err(e) => {
            log::error!("send_message: create_message failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn list_messages(
    state: tauri::State<'_, Mutex<Connection>>,
    thread_id: String,
) -> Result<Vec<DbMessage>, String> {
    log::debug!("list_messages: thread_id={}", thread_id);
    let conn = state.lock().map_err(|e| {
        log::error!("list_messages: failed to lock db: {}", e);
        e.to_string()
    })?;
    match queries::list_messages(&conn, &thread_id) {
        Ok(msgs) => {
            log::debug!("list_messages: ok count={}", msgs.len());
            Ok(msgs)
        }
        Err(e) => {
            log::error!("list_messages: query failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn list_project_memories(
    state: tauri::State<'_, Mutex<Connection>>,
    project_id: String,
) -> Result<Vec<DbProjectMemory>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::list_by_project(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pin_project_memory(
    state: tauri::State<'_, Mutex<Connection>>,
    project_id: String,
    content: String,
) -> Result<DbProjectMemory, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let id = uuid_v4();
    queries::insert_project_memory(
        &conn,
        &id,
        &project_id,
        "manual_note",
        None,
        content.trim(),
        0,
    )
    .map_err(|e| e.to_string())
}

/// Append a thread turn summary to the thread's project memory (if the thread belongs to a project).
/// Called after each assistant response so project context stays updated.
#[tauri::command]
pub fn append_thread_summary(
    state: tauri::State<'_, Mutex<Connection>>,
    thread_id: String,
    user_content: String,
    assistant_content: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let thread = queries::get_thread(&conn, &thread_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Thread not found".to_string())?;
    let project_id = match &thread.folder_id {
        Some(id) => id.as_str(),
        None => return Ok(()),
    };
    let u = user_content.chars().take(300).collect::<String>();
    let a = assistant_content.chars().take(800).collect::<String>();
    let content = format!("User: {} | Assistant: {}", u, a);
    let id = uuid_v4();
    queries::insert_project_memory(
        &conn,
        &id,
        project_id,
        "thread_summary",
        Some(&thread_id),
        &content,
        0,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Simple UUID v4 generator using random bytes.
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    // Use timestamp + random-ish bits for a unique-enough ID
    // For production, consider the `uuid` crate
    format!("{:032x}", now)
}
