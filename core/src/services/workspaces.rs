use rusqlite::Connection;
use crate::db::queries::workspaces as repo;

pub use repo::SavedWorkspaceWithFiles;

pub fn save_all(conn: &Connection, workspaces: &[SavedWorkspaceWithFiles]) -> Result<(), String> {
    repo::clear_all(conn).map_err(|e| e.to_string())?;

    for (i, ws) in workspaces.iter().enumerate() {
        repo::insert_workspace(conn, &ws.id, &ws.path, &ws.name, i as i32, ws.is_active)
            .map_err(|e| e.to_string())?;

        for (j, f) in ws.open_files.iter().enumerate() {
            repo::insert_open_file(conn, &ws.id, &f.path, &f.name, j as i32, f.is_active, f.is_preview)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

pub fn load_all(conn: &Connection) -> Result<Vec<SavedWorkspaceWithFiles>, String> {
    repo::list_all(conn).map_err(|e| e.to_string())
}
