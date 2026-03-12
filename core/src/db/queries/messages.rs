use rusqlite::{params, Connection, Result};

use crate::db::models::DbMessage;

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
