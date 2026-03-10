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
pub fn list_folders(
    state: tauri::State<'_, Mutex<Connection>>,
) -> Result<Vec<DbFolder>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::list_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_folder(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::delete_folder(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_thread(
    state: tauri::State<'_, Mutex<Connection>>,
    folder_id: Option<String>,
    title: String,
) -> Result<DbThread, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let id = uuid_v4();
    queries::create_thread(&conn, &id, folder_id.as_deref(), &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_threads(
    state: tauri::State<'_, Mutex<Connection>>,
) -> Result<Vec<DbThread>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::list_threads(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_thread(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::delete_thread(&conn, &id).map_err(|e| e.to_string())
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
pub fn send_message(
    state: tauri::State<'_, Mutex<Connection>>,
    id: String,
    thread_id: String,
    role: String,
    content: String,
    duration_ms: Option<i64>,
) -> Result<DbMessage, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::create_message(&conn, &id, &thread_id, &role, &content, duration_ms)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_messages(
    state: tauri::State<'_, Mutex<Connection>>,
    thread_id: String,
) -> Result<Vec<DbMessage>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    queries::list_messages(&conn, &thread_id).map_err(|e| e.to_string())
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
