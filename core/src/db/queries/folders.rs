use rusqlite::{params, Connection, Result};

use crate::db::models::DbFolder;

pub fn create_folder(conn: &Connection, id: &str, name: &str) -> Result<DbFolder> {
    let position: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM folders",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO folders (id, name, position, icon, color) VALUES (?1, ?2, ?3, 'Folder', '#6b7280')",
        params![id, name, position],
    )?;

    conn.query_row(
        "SELECT id, name, position, icon, color, created_at FROM folders WHERE id = ?1",
        params![id],
        |row| {
            Ok(DbFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                position: row.get(2)?,
                icon: row.get(3)?,
                color: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )
}

pub fn list_folders(conn: &Connection) -> Result<Vec<DbFolder>> {
    let mut stmt =
        conn.prepare("SELECT id, name, position, icon, color, created_at FROM folders ORDER BY position")?;
    let rows = stmt.query_map([], |row| {
        Ok(DbFolder {
            id: row.get(0)?,
            name: row.get(1)?,
            position: row.get(2)?,
            icon: row.get(3)?,
            color: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
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
        conn.execute("UPDATE folders SET icon = ?1 WHERE id = ?2", params![icon, id])?;
    }
    if let Some(color) = color {
        conn.execute("UPDATE folders SET color = ?1 WHERE id = ?2", params![color, id])?;
    }
    Ok(())
}
