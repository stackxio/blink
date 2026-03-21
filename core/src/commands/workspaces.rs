use rusqlite::Connection;
use std::sync::Mutex;

use crate::services::workspaces as service;

pub use service::SavedWorkspaceWithFiles;

#[tauri::command]
pub async fn save_workspaces(
    state: tauri::State<'_, Mutex<Connection>>,
    workspaces: Vec<SavedWorkspaceWithFiles>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    service::save_all(&conn, &workspaces)
}

#[tauri::command]
pub async fn load_workspaces(
    state: tauri::State<'_, Mutex<Connection>>,
) -> Result<Vec<SavedWorkspaceWithFiles>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    service::load_all(&conn)
}
