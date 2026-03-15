//! Attachment commands: attach files to project/thread, list, preview, extract text.

use std::fs;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::db::models::DbAttachment;
use crate::db::queries;
use crate::scope::ScopeGuard;

fn scope_guard_for_thread(
    conn: &Connection,
    thread_id: Option<&str>,
) -> Result<ScopeGuard, String> {
    let guard = match thread_id {
        Some(tid) => {
            let (mode, root_path) = queries::get_effective_scope(conn, tid)
                .map_err(|e| e.to_string())?
                .unwrap_or(("system".to_string(), None));
            ScopeGuard::new(&mode, root_path.as_deref())
        }
        None => ScopeGuard::system(),
    };
    Ok(guard)
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:032x}", now)
}

fn mime_for_path(path: &Path) -> Option<String> {
    let ext = path.extension().and_then(|e| e.to_str())?.to_lowercase();
    Some(match ext.as_str() {
        "txt" => "text/plain".to_string(),
        "md" => "text/markdown".to_string(),
        "csv" => "text/csv".to_string(),
        "pdf" => "application/pdf".to_string(),
        _ => return None,
    })
}

#[tauri::command]
pub fn attach_files(
    state: tauri::State<'_, Mutex<Connection>>,
    project_id: Option<String>,
    thread_id: Option<String>,
    paths: Vec<String>,
) -> Result<Vec<DbAttachment>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let guard = scope_guard_for_thread(&conn, thread_id.as_deref())?;
    let mut out = Vec::with_capacity(paths.len());
    for path_str in paths {
        let path = Path::new(&path_str);
        if !path.exists() {
            continue;
        }
        guard.allow_read(path).map_err(|e| e.to_string())?;
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        let size_bytes = metadata.len() as i64;
        let original_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let mime_type = mime_for_path(path);
        let id = uuid_v4();
        let att = queries::insert_attachment(
            &conn,
            &id,
            project_id.as_deref(),
            thread_id.as_deref(),
            None,
            &original_name,
            mime_type.as_deref(),
            &path_str,
            size_bytes,
            "pending",
        )
        .map_err(|e| e.to_string())?;
        out.push(att);
    }
    Ok(out)
}

#[tauri::command]
pub fn list_attachments(
    state: tauri::State<'_, Mutex<Connection>>,
    project_id: Option<String>,
    thread_id: Option<String>,
) -> Result<Vec<DbAttachment>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let list = if let Some(pid) = &project_id {
        queries::list_attachments_by_project(&conn, pid).map_err(|e| e.to_string())?
    } else if let Some(tid) = &thread_id {
        queries::list_attachments_by_thread(&conn, tid).map_err(|e| e.to_string())?
    } else {
        vec![]
    };
    Ok(list)
}

#[tauri::command]
pub fn read_attachment_preview(
    state: tauri::State<'_, Mutex<Connection>>,
    attachment_id: String,
) -> Result<Option<String>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let att = queries::get_attachment(&conn, &attachment_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Attachment not found".to_string())?;
    if let Some(preview) = &att.preview_text {
        return Ok(Some(preview.clone()));
    }
    let path = Path::new(&att.file_path);
    if !path.exists() {
        return Ok(None);
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if matches!(ext.to_lowercase().as_str(), "txt" | "md" | "csv") {
        let content = fs::read_to_string(path).unwrap_or_default();
        let preview = content.chars().take(2000).collect::<String>();
        return Ok(Some(preview));
    }
    Ok(None)
}

#[tauri::command]
pub fn extract_attachment_text(
    state: tauri::State<'_, Mutex<Connection>>,
    attachment_id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let att = queries::get_attachment(&conn, &attachment_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Attachment not found".to_string())?;
    let path = Path::new(&att.file_path);
    if !path.exists() {
        queries::set_attachment_extraction(&conn, &attachment_id, "failed", None, None)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let (status, preview) = match ext.to_lowercase().as_str() {
        "txt" | "md" | "csv" => {
            let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
            let preview = content.chars().take(4000).collect::<String>();
            (
                "complete",
                Some(if content.len() > 4000 {
                    format!("{}...", preview)
                } else {
                    preview
                }),
            )
        }
        "pdf" => {
            match fs::read(path) {
                Ok(bytes) => match pdf_extract::extract_text_from_mem(&bytes) {
                    Ok(text) => {
                        let preview = text.chars().take(4000).collect::<String>();
                        (
                            "complete",
                            Some(if text.len() > 4000 {
                                format!("{}...", preview)
                            } else {
                                preview
                            }),
                        )
                    }
                    Err(_) => ("failed", Some("PDF could not be extracted (e.g. scanned image).".to_string())),
                },
                Err(e) => ("failed", Some(format!("Could not read PDF: {}", e))),
            }
        }
        _ => ("failed", None),
    };
    queries::set_attachment_extraction(
        &conn,
        &attachment_id,
        status,
        None,
        preview.as_deref(),
    )
        .map_err(|e| e.to_string())?;
    Ok(())
}
