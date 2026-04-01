use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::connectors::filesystem::{FilesystemConnector, FilesystemEntry};
use crate::db::queries;
use crate::scope::ScopeGuard;
use crate::services::chat;
use crate::settings::store::SettingsStore;

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

#[tauri::command]
pub async fn summarize_folder(
    state: tauri::State<'_, Mutex<Connection>>,
    path: String,
    thread_id: Option<String>,
) -> Result<String, String> {
    let guard = {
        let conn = state.lock().map_err(|e| e.to_string())?;
        scope_guard_for_thread(&conn, thread_id.as_deref())?
    };
    let connector = FilesystemConnector::new();
    let path = connector.expand_path(&path);
    guard.allow_read(&path).map_err(|e| e.to_string())?;
    let entries = connector.list_dir(&path).map_err(|e| e.to_string())?;

    let directories = entries.iter().filter(|entry| entry.is_dir).count();
    let files = entries.len().saturating_sub(directories);
    let hidden = entries
        .iter()
        .filter(|entry| entry.name.starts_with('.'))
        .count();
    let total_size: u64 = entries
        .iter()
        .filter(|entry| !entry.is_dir)
        .map(|entry| entry.size)
        .sum();

    let mut extension_counts = HashMap::<String, usize>::new();
    for entry in entries.iter().filter(|entry| !entry.is_dir) {
        let extension = entry
            .path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
            .unwrap_or_else(|| "no extension".to_string());
        *extension_counts.entry(extension).or_default() += 1;
    }

    let mut top_extensions = extension_counts.into_iter().collect::<Vec<_>>();
    top_extensions.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    top_extensions.truncate(5);

    let mut largest_files = entries
        .iter()
        .filter(|entry| !entry.is_dir)
        .collect::<Vec<_>>();
    largest_files.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
    largest_files.truncate(5);

    let visible_preview = entries
        .iter()
        .take(10)
        .map(|entry| {
            let kind = if entry.is_dir { "dir" } else { "file" };
            if entry.is_dir {
                format!("- {} ({kind})", entry.name)
            } else {
                format!("- {} ({kind}, {})", entry.name, format_bytes(entry.size))
            }
        })
        .collect::<Vec<_>>();

    let ext_summary = if top_extensions.is_empty() {
        "none".to_string()
    } else {
        top_extensions
            .iter()
            .map(|(extension, count)| format!("{extension}: {count}"))
            .collect::<Vec<_>>()
            .join(", ")
    };

    let largest_summary = if largest_files.is_empty() {
        "none".to_string()
    } else {
        largest_files
            .iter()
            .map(|entry| format!("{} ({})", entry.name, format_bytes(entry.size)))
            .collect::<Vec<_>>()
            .join(", ")
    };

    Ok(format!(
        "Folder summary for {}:\n- {} entries total\n- {} directories\n- {} files\n- {} hidden entries\n- {} total file size\n- Top extensions: {}\n- Largest files: {}\n- Sample contents:\n{}",
        path.display(),
        entries.len(),
        directories,
        files,
        hidden,
        format_bytes(total_size),
        ext_summary,
        largest_summary,
        visible_preview.join("\n"),
    ))
}

#[tauri::command]
pub async fn organize_downloads(
    state: tauri::State<'_, Mutex<Connection>>,
    thread_id: Option<String>,
) -> Result<String, String> {
    let guard = {
        let conn = state.lock().map_err(|e| e.to_string())?;
        scope_guard_for_thread(&conn, thread_id.as_deref())?
    };
    let connector = FilesystemConnector::new();
    let downloads_dir = dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Downloads")))
        .ok_or_else(|| "Could not resolve Downloads directory".to_string())?;
    guard
        .allow_read(&downloads_dir)
        .map_err(|e| e.to_string())?;
    let entries = connector
        .list_dir(&downloads_dir)
        .map_err(|e| e.to_string())?;

    let mut moved = Vec::new();
    let mut skipped = 0usize;

    for entry in entries {
        if entry.is_dir || entry.name.starts_with('.') {
            skipped += 1;
            continue;
        }

        let category = category_for_entry(&entry);
        let target_dir = downloads_dir.join(category);

        guard.allow_read(&entry.path).map_err(|e| e.to_string())?;
        guard.allow_write(&target_dir).map_err(|e| e.to_string())?;

        if entry.path.parent() == Some(target_dir.as_path()) {
            skipped += 1;
            continue;
        }

        let target = connector
            .move_to_dir(&entry.path, &target_dir)
            .map_err(|e| e.to_string())?;
        moved.push(format!(
            "{} -> {}",
            entry.name,
            target
                .strip_prefix(&downloads_dir)
                .unwrap_or(target.as_path())
                .display()
        ));
    }

    if moved.is_empty() {
        return Ok(format!(
            "Downloads already looks organized. {} entries were skipped.",
            skipped
        ));
    }

    let preview = moved.into_iter().take(15).collect::<Vec<_>>().join("\n- ");
    Ok(format!(
        "Organized {} files in {}. {} entries were skipped.\n- {}",
        preview.lines().count(),
        downloads_dir.display(),
        skipped,
        preview
    ))
}

#[tauri::command]
pub async fn rename_file_with_ai(
    state: tauri::State<'_, Mutex<Connection>>,
    path: String,
    thread_id: Option<String>,
) -> Result<String, String> {
    let guard = {
        let conn = state.lock().map_err(|e| e.to_string())?;
        scope_guard_for_thread(&conn, thread_id.as_deref())?
    };
    let connector = FilesystemConnector::new();
    let path = connector.expand_path(&path);
    guard.allow_read(&path).map_err(|e| e.to_string())?;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;

    if !metadata.is_file() {
        return Err("rename_file_with_ai only supports files".to_string());
    }

    let original_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Could not resolve file name".to_string())?;
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase());
    let text_preview = read_text_preview(&connector, &path);

    let suggested_stem =
        suggest_file_stem(original_name, extension.as_deref(), text_preview.as_deref())
            .await
            .unwrap_or_else(|_| heuristic_file_stem(&path, text_preview.as_deref()));
    let final_name = build_final_file_name(&suggested_stem, extension.as_deref());

    if final_name == original_name {
        return Ok(format!("Kept existing file name: {}", original_name));
    }

    let target_path = path
        .parent()
        .map(|p| p.join(&final_name))
        .unwrap_or_else(|| path.clone());
    guard.allow_write(&target_path).map_err(|e| e.to_string())?;

    let renamed = connector
        .rename_path(&path, &final_name)
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "Renamed {} -> {}",
        original_name,
        renamed
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&final_name)
    ))
}

fn category_for_entry(entry: &FilesystemEntry) -> &'static str {
    let extension = entry
        .path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase());

    match extension.as_deref() {
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "heic" | "avif") => "Images",
        Some("mp4" | "mov" | "mkv" | "avi" | "webm") => "Videos",
        Some("mp3" | "wav" | "m4a" | "flac" | "aac") => "Audio",
        Some("zip" | "tar" | "gz" | "rar" | "7z" | "bz2" | "xz") => "Archives",
        Some(
            "pdf" | "doc" | "docx" | "pages" | "txt" | "md" | "rtf" | "ppt" | "pptx" | "xls"
            | "xlsx",
        ) => "Documents",
        Some("dmg" | "pkg" | "app" | "exe" | "msi") => "Apps",
        Some(
            "rs" | "ts" | "tsx" | "js" | "jsx" | "json" | "py" | "go" | "java" | "c" | "cpp" | "h"
            | "html" | "css" | "sql" | "sh" | "yaml" | "yml",
        ) => "Code",
        _ => "Other",
    }
}

fn format_bytes(size: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = size as f64;
    let mut unit_index = 0usize;

    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", size, UNITS[unit_index])
    } else {
        format!("{value:.1} {}", UNITS[unit_index])
    }
}

fn read_text_preview(connector: &FilesystemConnector, path: &Path) -> Option<String> {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())?;

    if !matches!(
        extension.as_str(),
        "txt"
            | "md"
            | "rs"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "json"
            | "py"
            | "toml"
            | "yaml"
            | "yml"
            | "html"
            | "css"
            | "csv"
    ) {
        return None;
    }

    let content = connector.read_file(path).ok()?;
    let preview = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(20)
        .collect::<Vec<_>>()
        .join("\n");

    if preview.is_empty() {
        None
    } else {
        Some(preview.chars().take(4_000).collect())
    }
}

async fn suggest_file_stem(
    original_name: &str,
    extension: Option<&str>,
    text_preview: Option<&str>,
) -> Result<String, String> {
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;
    let router = chat::build_router(&settings);
    let preview = text_preview.unwrap_or("No readable text preview available.");
    let extension = extension.unwrap_or("none");
    let prompt = format!(
        "Suggest a concise, descriptive filename stem for this file.\n\
Return only the filename stem, without quotes, path, or extension.\n\
Use lowercase kebab-case.\n\
Original filename: {original_name}\n\
Extension: {extension}\n\
Preview:\n{preview}"
    );

    use crate::providers::types::ChatRequest;
    let response = router
        .chat(ChatRequest {
            prompt,
            system: Some(
                "You rename local files. Respond with only a safe filename stem in lowercase kebab-case.".to_string(),
            ),
            messages: vec![],
        })
        .await
        .map_err(|e| e.to_string())?;

    Ok(sanitize_file_stem(&response.text))
}

fn heuristic_file_stem(path: &Path, text_preview: Option<&str>) -> String {
    if let Some(preview) = text_preview {
        for line in preview.lines() {
            let candidate = sanitize_file_stem(line);
            if candidate.len() >= 4 {
                return candidate;
            }
        }
    }

    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("file");
    sanitize_file_stem(stem)
}

fn build_final_file_name(stem: &str, extension: Option<&str>) -> String {
    let stem = sanitize_file_stem(stem);
    match extension {
        Some(extension) if !extension.is_empty() => format!("{stem}.{extension}"),
        _ => stem,
    }
}

fn sanitize_file_stem(value: &str) -> String {
    let first_line = value.lines().next().unwrap_or(value);
    let without_wrappers = first_line
        .trim()
        .trim_matches('`')
        .trim_matches('"')
        .trim_matches('\'');

    let mut result = String::new();
    let mut last_was_dash = false;

    for ch in without_wrappers.chars() {
        if ch.is_ascii_alphanumeric() {
            result.push(ch.to_ascii_lowercase());
            last_was_dash = false;
        } else if !last_was_dash {
            result.push('-');
            last_was_dash = true;
        }
    }

    let cleaned = result.trim_matches('-').to_string();
    if cleaned.is_empty() {
        "file".to_string()
    } else {
        cleaned
    }
}
