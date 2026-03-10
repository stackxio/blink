use rusqlite::{params, Connection, Result};

use super::models::{DbFolder, DbMessage, DbThread};

pub fn create_folder(conn: &Connection, id: &str, name: &str) -> Result<DbFolder> {
    let position: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM folders",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO folders (id, name, position) VALUES (?1, ?2, ?3)",
        params![id, name, position],
    )?;

    conn.query_row("SELECT id, name, position, created_at FROM folders WHERE id = ?1", params![id], |row| {
        Ok(DbFolder {
            id: row.get(0)?,
            name: row.get(1)?,
            position: row.get(2)?,
            created_at: row.get(3)?,
        })
    })
}

pub fn list_folders(conn: &Connection) -> Result<Vec<DbFolder>> {
    let mut stmt = conn.prepare("SELECT id, name, position, created_at FROM folders ORDER BY position")?;
    let rows = stmt.query_map([], |row| {
        Ok(DbFolder {
            id: row.get(0)?,
            name: row.get(1)?,
            position: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn delete_folder(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn create_thread(
    conn: &Connection,
    id: &str,
    folder_id: Option<&str>,
    title: &str,
) -> Result<DbThread> {
    conn.execute(
        "INSERT INTO threads (id, folder_id, title) VALUES (?1, ?2, ?3)",
        params![id, folder_id, title],
    )?;

    conn.query_row(
        "SELECT id, folder_id, title, created_at, updated_at FROM threads WHERE id = ?1",
        params![id],
        |row| {
            Ok(DbThread {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
}

pub fn list_threads(conn: &Connection) -> Result<Vec<DbThread>> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbThread {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn delete_thread(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM threads WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_thread_title(conn: &Connection, id: &str, title: &str) -> Result<()> {
    conn.execute(
        "UPDATE threads SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![title, id],
    )?;
    Ok(())
}

pub fn move_thread_to_folder(conn: &Connection, id: &str, folder_id: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE threads SET folder_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![folder_id, id],
    )?;
    Ok(())
}

pub fn rename_folder(conn: &Connection, id: &str, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE folders SET name = ?1 WHERE id = ?2",
        params![name, id],
    )?;
    Ok(())
}

pub fn create_message(
    conn: &Connection,
    id: &str,
    thread_id: &str,
    role: &str,
    content: &str,
    duration_ms: Option<i64>,
) -> Result<DbMessage> {
    conn.execute(
        "INSERT INTO messages (id, thread_id, role, content, duration_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, thread_id, role, content, duration_ms],
    )?;

    // Also update the thread's updated_at timestamp
    conn.execute(
        "UPDATE threads SET updated_at = datetime('now') WHERE id = ?1",
        params![thread_id],
    )?;

    conn.query_row(
        "SELECT id, thread_id, role, content, duration_ms, created_at FROM messages WHERE id = ?1",
        params![id],
        |row| {
            Ok(DbMessage {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                duration_ms: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )
}

pub fn list_messages(conn: &Connection, thread_id: &str) -> Result<Vec<DbMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, role, content, duration_ms, created_at FROM messages WHERE thread_id = ?1 ORDER BY created_at",
    )?;
    let rows = stmt.query_map(params![thread_id], |row| {
        Ok(DbMessage {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            duration_ms: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect()
}
