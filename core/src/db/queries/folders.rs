use rusqlite::{params, Connection, Result};

use crate::db::models::DbFolder;

const FOLDER_COLS: &str =
    "id, name, position, root_path, scope_mode, icon, color, shared_context_summary, created_at, updated_at";

fn row_to_folder(row: &rusqlite::Row<'_>) -> rusqlite::Result<DbFolder> {
    Ok(DbFolder {
        id: row.get(0)?,
        name: row.get(1)?,
        position: row.get(2)?,
        root_path: row.get(3)?,
        scope_mode: row.get(4)?,
        icon: row.get(5)?,
        color: row.get(6)?,
        shared_context_summary: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

pub fn create_folder(
    conn: &Connection,
    id: &str,
    name: &str,
    scope_mode: &str,
    root_path: Option<&str>,
) -> Result<DbFolder> {
    let position: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM folders",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO folders (id, name, position, root_path, scope_mode, icon, color) VALUES (?1, ?2, ?3, ?4, ?5, 'Folder', '#6b7280')",
        params![id, name, position, root_path, scope_mode],
    )?;

    conn.query_row(
        &format!("SELECT {} FROM folders WHERE id = ?1", FOLDER_COLS),
        params![id],
        |row| row_to_folder(row),
    )
}

pub fn get_folder(conn: &Connection, id: &str) -> Result<Option<DbFolder>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM folders WHERE id = ?1",
        FOLDER_COLS
    ))?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_folder(&row)?))
    } else {
        Ok(None)
    }
}

pub fn list_folders(conn: &Connection) -> Result<Vec<DbFolder>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM folders ORDER BY position",
        FOLDER_COLS
    ))?;
    let rows = stmt.query_map([], |row| row_to_folder(&row))?;
    rows.collect()
}

pub fn delete_folder(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn rename_folder(conn: &Connection, id: &str, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE folders SET name = ?1 WHERE id = ?2",
        params![name, id],
    )?;
    Ok(())
}

pub fn update_folder_appearance(
    conn: &Connection,
    id: &str,
    icon: Option<&str>,
    color: Option<&str>,
) -> Result<()> {
    if let Some(icon) = icon {
        conn.execute(
            "UPDATE folders SET icon = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![icon, id],
        )?;
    }
    if let Some(color) = color {
        conn.execute(
            "UPDATE folders SET color = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![color, id],
        )?;
    }
    Ok(())
}

pub fn update_folder_scope(
    conn: &Connection,
    id: &str,
    scope_mode: &str,
    root_path: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE folders SET scope_mode = ?1, root_path = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![scope_mode, root_path, id],
    )?;
    Ok(())
}
