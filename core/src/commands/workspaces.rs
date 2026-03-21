use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedWorkspace {
    pub id: String,
    pub path: String,
    pub name: String,
    pub position: i32,
    pub is_active: bool,
    pub open_files: Vec<SavedOpenFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedOpenFile {
    pub path: String,
    pub name: String,
    pub position: i32,
    pub is_active: bool,
    pub is_preview: bool,
}

#[tauri::command]
pub async fn save_workspaces(
    state: tauri::State<'_, Mutex<Connection>>,
    workspaces: Vec<SavedWorkspace>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;

    // Clear existing
    conn.execute("DELETE FROM workspace_open_files", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM workspaces", [])
        .map_err(|e| e.to_string())?;

    for (i, ws) in workspaces.iter().enumerate() {
        conn.execute(
            "INSERT INTO workspaces (id, path, name, position, is_active) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![ws.id, ws.path, ws.name, i as i32, ws.is_active],
        )
        .map_err(|e| e.to_string())?;

        for (j, f) in ws.open_files.iter().enumerate() {
            conn.execute(
                "INSERT INTO workspace_open_files (workspace_id, path, name, position, is_active, is_preview) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![ws.id, f.path, f.name, j as i32, f.is_active, f.is_preview],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn load_workspaces(
    state: tauri::State<'_, Mutex<Connection>>,
) -> Result<Vec<SavedWorkspace>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, path, name, position, is_active FROM workspaces ORDER BY position")
        .map_err(|e| e.to_string())?;

    let ws_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, bool>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut workspaces = Vec::new();

    for ws_row in ws_rows {
        let (id, path, name, position, is_active) = ws_row.map_err(|e| e.to_string())?;

        let mut file_stmt = conn
            .prepare("SELECT path, name, position, is_active, is_preview FROM workspace_open_files WHERE workspace_id = ?1 ORDER BY position")
            .map_err(|e| e.to_string())?;

        let files = file_stmt
            .query_map(rusqlite::params![&id], |row| {
                Ok(SavedOpenFile {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    position: row.get(2)?,
                    is_active: row.get(3)?,
                    is_preview: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        workspaces.push(SavedWorkspace {
            id,
            path,
            name,
            position,
            is_active,
            open_files: files,
        });
    }

    Ok(workspaces)
}
