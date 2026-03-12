use rusqlite::{params, Connection, Result};

use crate::db::models::DbThread;

const THREAD_COLS: &str =
    "id, folder_id, title, root_path_override, scope_mode_override, created_at, updated_at, archived_at";
const THREAD_COLS_WITH_COUNT: &str =
    "id, folder_id, title, root_path_override, scope_mode_override, created_at, updated_at, archived_at, (SELECT COUNT(*) FROM messages WHERE thread_id = threads.id)";

fn row_to_thread(row: &rusqlite::Row<'_>) -> rusqlite::Result<DbThread> {
    Ok(DbThread {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        title: row.get(2)?,
        root_path_override: row.get(3)?,
        scope_mode_override: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "inherit".to_string()),
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        archived_at: row.get(7)?,
        message_count: row.get(8)?,
    })
}

pub fn create_thread(
    conn: &Connection,
    id: &str,
    folder_id: Option<&str>,
    title: &str,
    scope_mode_override: Option<&str>,
    root_path_override: Option<&str>,
) -> Result<DbThread> {
    let scope = scope_mode_override.unwrap_or("inherit");
    conn.execute(
        "INSERT INTO threads (id, folder_id, title, root_path_override, scope_mode_override, archived_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
        params![id, folder_id, title, root_path_override, scope],
    )?;

    conn.query_row(
        &format!("SELECT {} FROM threads WHERE id = ?1", THREAD_COLS_WITH_COUNT),
        params![id],
        |row| row_to_thread(row),
    )
}

pub fn get_thread(conn: &Connection, id: &str) -> Result<Option<DbThread>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM threads WHERE id = ?1",
        THREAD_COLS_WITH_COUNT
    ))?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_thread(&row)?))
    } else {
        Ok(None)
    }
}

pub fn list_threads(conn: &Connection) -> Result<Vec<DbThread>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM threads WHERE archived_at IS NULL ORDER BY updated_at DESC",
        THREAD_COLS_WITH_COUNT
    ))?;
    let rows = stmt.query_map([], |row| row_to_thread(&row))?;
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

pub fn update_thread_scope(
    conn: &Connection,
    id: &str,
    scope_mode_override: &str,
    root_path_override: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE threads SET scope_mode_override = ?1, root_path_override = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![scope_mode_override, root_path_override, id],
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
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM threads WHERE archived_at IS NOT NULL ORDER BY archived_at DESC",
        THREAD_COLS_WITH_COUNT
    ))?;
    let rows = stmt.query_map([], |row| row_to_thread(&row))?;
    rows.collect()
}
