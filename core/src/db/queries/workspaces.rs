use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedWorkspace {
    pub id: String,
    pub path: String,
    pub name: String,
    pub position: i32,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedOpenFile {
    pub path: String,
    pub name: String,
    pub position: i32,
    pub is_active: bool,
    pub is_preview: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedWorkspaceWithFiles {
    pub id: String,
    pub path: String,
    pub name: String,
    pub position: i32,
    pub is_active: bool,
    pub open_files: Vec<SavedOpenFile>,
}

pub fn clear_all(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM workspace_open_files", [])?;
    conn.execute("DELETE FROM workspaces", [])?;
    Ok(())
}

pub fn insert_workspace(
    conn: &Connection,
    id: &str,
    path: &str,
    name: &str,
    position: i32,
    is_active: bool,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO workspaces (id, path, name, position, is_active) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, path, name, position, is_active],
    )?;
    Ok(())
}

pub fn insert_open_file(
    conn: &Connection,
    workspace_id: &str,
    path: &str,
    name: &str,
    position: i32,
    is_active: bool,
    is_preview: bool,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO workspace_open_files (workspace_id, path, name, position, is_active, is_preview) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![workspace_id, path, name, position, is_active, is_preview],
    )?;
    Ok(())
}

pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<SavedWorkspaceWithFiles>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, position, is_active FROM workspaces ORDER BY position",
    )?;

    let ws_rows: Vec<SavedWorkspace> = stmt
        .query_map([], |row| {
            Ok(SavedWorkspace {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                position: row.get(3)?,
                is_active: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut result = Vec::new();

    for ws in ws_rows {
        let mut file_stmt = conn.prepare(
            "SELECT path, name, position, is_active, is_preview FROM workspace_open_files WHERE workspace_id = ?1 ORDER BY position",
        )?;

        let files: Vec<SavedOpenFile> = file_stmt
            .query_map(params![&ws.id], |row| {
                Ok(SavedOpenFile {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    position: row.get(2)?,
                    is_active: row.get(3)?,
                    is_preview: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        result.push(SavedWorkspaceWithFiles {
            id: ws.id,
            path: ws.path,
            name: ws.name,
            position: ws.position,
            is_active: ws.is_active,
            open_files: files,
        });
    }

    Ok(result)
}
