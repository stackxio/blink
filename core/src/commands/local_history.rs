use chrono::{Local, TimeZone, Utc};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

const DEFAULT_MAX_SNAPSHOTS: usize = 50;

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub timestamp_ms: i64,
    pub label: String,
    pub snapshot_file: String,
}

fn percent_encode_path(path: &str) -> String {
    path.replace('%', "%25")
        .replace('/', "%2F")
        .replace('\\', "%5C")
}

fn history_dir_for_file(file_path: &str) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let encoded = percent_encode_path(file_path);
    home.join(".blink").join("local-history").join(encoded)
}

fn format_timestamp_label(timestamp_ms: i64) -> String {
    let secs = timestamp_ms / 1000;
    let ns = ((timestamp_ms % 1000) * 1_000_000) as u32;
    let utc = match Utc.timestamp_opt(secs, ns) {
        chrono::LocalResult::Single(dt) => dt,
        _ => return format!("{}", timestamp_ms),
    };
    let local: chrono::DateTime<Local> = utc.into();
    let now = Local::now();

    if local.date_naive() == now.date_naive() {
        local.format("Today %H:%M:%S").to_string()
    } else if local.date_naive() == (now - chrono::Duration::days(1)).date_naive() {
        local.format("Yesterday %H:%M:%S").to_string()
    } else {
        local.format("%b %-d, %H:%M:%S").to_string()
    }
}

/// Save a snapshot of the file content to local history.
#[tauri::command]
pub async fn create_local_history_entry(
    file_path: String,
    content: String,
    max_snapshots: Option<usize>,
) -> Result<(), String> {
    let max = max_snapshots.unwrap_or(DEFAULT_MAX_SNAPSHOTS);
    let dir = history_dir_for_file(&file_path);

    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create history dir: {}", e))?;

    let timestamp_ms = Utc::now().timestamp_millis();
    let snap_file = dir.join(format!("{}.snap", timestamp_ms));
    fs::write(&snap_file, &content).map_err(|e| format!("Failed to write snapshot: {}", e))?;

    // Prune old snapshots beyond max
    let mut entries: Vec<i64> = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read history dir: {}", e))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name();
            let stem = name.to_string_lossy();
            stem.strip_suffix(".snap")
                .and_then(|s| s.parse::<i64>().ok())
        })
        .collect();

    entries.sort_unstable_by(|a, b| b.cmp(a)); // newest first

    for old_ts in entries.iter().skip(max) {
        let old_file = dir.join(format!("{}.snap", old_ts));
        let _ = fs::remove_file(old_file);
    }

    Ok(())
}

/// List all history entries for a file, newest first.
#[tauri::command]
pub async fn list_local_history(file_path: String) -> Result<Vec<HistoryEntry>, String> {
    let dir = history_dir_for_file(&file_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<i64> = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read history dir: {}", e))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name();
            let stem = name.to_string_lossy();
            stem.strip_suffix(".snap")
                .and_then(|s| s.parse::<i64>().ok())
        })
        .collect();

    entries.sort_unstable_by(|a, b| b.cmp(a)); // newest first

    Ok(entries
        .into_iter()
        .map(|ts| HistoryEntry {
            timestamp_ms: ts,
            label: format_timestamp_label(ts),
            snapshot_file: dir
                .join(format!("{}.snap", ts))
                .to_string_lossy()
                .to_string(),
        })
        .collect())
}

/// Read the content of a specific snapshot file.
#[tauri::command]
pub async fn read_local_history_entry(snapshot_file: String) -> Result<String, String> {
    fs::read_to_string(&snapshot_file).map_err(|e| format!("Failed to read snapshot: {}", e))
}

/// Delete all history snapshots for a file.
#[tauri::command]
pub async fn clear_local_history_for_file(file_path: String) -> Result<(), String> {
    let dir = history_dir_for_file(&file_path);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Failed to clear history: {}", e))?;
    }
    Ok(())
}
