use rusqlite::{params, Connection, Result};

use crate::db::models::DbThread;

pub fn create_thread(
    conn: &Connection,
    id: &str,
    folder_id: Option<&str>,
    title: &str,
) -> Result<DbThread> {
    conn.execute(
        "INSERT INTO threads (id, folder_id, title, archived_at) VALUES (?1, ?2, ?3, NULL)",
        params![id, folder_id, title],
    )?;

    conn.query_row(
        "SELECT id, folder_id, title, created_at, updated_at, archived_at, (SELECT COUNT(*) FROM messages WHERE thread_id = threads.id) FROM threads WHERE id = ?1",
        params![id],
        |row| {
            Ok(DbThread {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                archived_at: row.get(5)?,
                message_count: row.get(6)?,
            })
        },
    )
}

pub fn list_threads(conn: &Connection) -> Result<Vec<DbThread>> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, title, created_at, updated_at, archived_at, (SELECT COUNT(*) FROM messages WHERE thread_id = threads.id) FROM threads WHERE archived_at IS NULL ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbThread {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            archived_at: row.get(5)?,
            message_count: row.get(6)?,
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

pub fn get_codex_thread_id(conn: &Connection, thread_id: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT codex_thread_id FROM threads WHERE id = ?1",
        params![thread_id],
        |row| row.get(0),
    )
}

pub fn set_codex_thread_id(
    conn: &Connection,
    thread_id: &str,
    codex_thread_id: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE threads SET codex_thread_id = ?1 WHERE id = ?2",
        params![codex_thread_id, thread_id],
    )?;
    Ok(())
}

pub fn archive_thread(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE threads SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn unarchive_thread(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE threads SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn list_archived_threads(conn: &Connection) -> Result<Vec<DbThread>> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, title, created_at, updated_at, archived_at, (SELECT COUNT(*) FROM messages WHERE thread_id = threads.id) FROM threads WHERE archived_at IS NOT NULL ORDER BY archived_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbThread {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            archived_at: row.get(5)?,
            message_count: row.get(6)?,
        })
    })?;
    rows.collect()
}
