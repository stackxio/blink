use crate::db::models::{DbFolder, DbMessage, DbThread};
use crate::db::queries;
use rusqlite::Connection;
use std::sync::Mutex;

#[tauri::command]
pub fn create_folder(
    state: tauri::State<'_, Mutex<Connection>>,
    name: String,
) -> Result<DbFolder, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let id = uuid_v4();
    queries::create_folder(&conn, &id, &name).map_err(|e| e.to_string())
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
) -> Result<DbThread, String> {
    log::info!("create_thread: folder_id={:?}, title={}", folder_id, title);
    let conn = state.lock().map_err(|e| {
        log::error!("create_thread: failed to lock db: {}", e);
        e.to_string()
    })?;
    let id = uuid_v4();
    match queries::create_thread(&conn, &id, folder_id.as_deref(), &title) {
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
pub fn archive_thread(state: tauri::State<'_, Mutex<Connection>>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::archive_thread(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unarchive_thread(state: tauri::State<'_, Mutex<Connection>>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::unarchive_thread(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_archived_threads(state: tauri::State<'_, Mutex<Connection>>) -> Result<Vec<DbThread>, String> {
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
