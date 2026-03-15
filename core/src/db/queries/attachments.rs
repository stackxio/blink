use rusqlite::{params, Connection, Result};

use crate::db::models::DbAttachment;

pub fn insert_attachment(
    conn: &Connection,
    id: &str,
    project_id: Option<&str>,
    thread_id: Option<&str>,
    message_id: Option<&str>,
    original_name: &str,
    mime_type: Option<&str>,
    file_path: &str,
    size_bytes: i64,
    extraction_status: &str,
) -> Result<DbAttachment> {
    conn.execute(
        "INSERT INTO attachments (id, project_id, thread_id, message_id, original_name, mime_type, file_path, size_bytes, extraction_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            project_id,
            thread_id,
            message_id,
            original_name,
            mime_type,
            file_path,
            size_bytes,
            extraction_status,
        ],
    )?;
    get_attachment(conn, id).map(|o| o.expect("attachment just inserted"))
}

pub fn get_attachment(conn: &Connection, id: &str) -> Result<Option<DbAttachment>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, thread_id, message_id, original_name, mime_type, file_path, size_bytes, extraction_status, extracted_text_path, preview_text, created_at
         FROM attachments WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row_to_attachment(&row)?))
    } else {
        Ok(None)
    }
}

pub fn list_attachments_by_project(conn: &Connection, project_id: &str) -> Result<Vec<DbAttachment>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, thread_id, message_id, original_name, mime_type, file_path, size_bytes, extraction_status, extracted_text_path, preview_text, created_at
         FROM attachments WHERE project_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| row_to_attachment(&row))?;
    rows.collect()
}

pub fn list_attachments_by_thread(conn: &Connection, thread_id: &str) -> Result<Vec<DbAttachment>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, thread_id, message_id, original_name, mime_type, file_path, size_bytes, extraction_status, extracted_text_path, preview_text, created_at
         FROM attachments WHERE thread_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![thread_id], |row| row_to_attachment(&row))?;
    rows.collect()
}

pub fn set_attachment_extraction(
    conn: &Connection,
    id: &str,
    status: &str,
    extracted_text_path: Option<&str>,
    preview_text: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE attachments SET extraction_status = ?1, extracted_text_path = ?2, preview_text = ?3 WHERE id = ?4",
        params![status, extracted_text_path, preview_text, id],
    )?;
    Ok(())
}

fn row_to_attachment(row: &rusqlite::Row<'_>) -> rusqlite::Result<DbAttachment> {
    Ok(DbAttachment {
        id: row.get(0)?,
        project_id: row.get(1)?,
        thread_id: row.get(2)?,
        message_id: row.get(3)?,
        original_name: row.get(4)?,
        mime_type: row.get(5)?,
        file_path: row.get(6)?,
        size_bytes: row.get(7)?,
        extraction_status: row.get(8)?,
        extracted_text_path: row.get(9)?,
        preview_text: row.get(10)?,
        created_at: row.get(11)?,
    })
}
