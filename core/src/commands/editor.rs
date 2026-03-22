use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line_number: usize,
    pub line_text: String,
    pub column: usize,
}

/// Search for a query string in all files under a directory.
/// Skips binary files, hidden dirs, node_modules, .git, target, etc.
#[tauri::command]
pub async fn search_in_files(
    root: String,
    query: String,
    max_results: Option<usize>,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    is_regex: Option<bool>,
) -> Result<Vec<SearchMatch>, String> {
    let max = max_results.unwrap_or(100);
    let case_sensitive = case_sensitive.unwrap_or(false);
    let whole_word = whole_word.unwrap_or(false);
    let is_regex = is_regex.unwrap_or(false);
    let root_path = PathBuf::from(&root);
    let mut results = Vec::new();
    let mut stack = vec![root_path.clone()];

    let skip_dirs: &[&str] = &[
        "node_modules",
        ".git",
        "target",
        "dist",
        "build",
        ".next",
        "__pycache__",
        ".venv",
        "venv",
        ".cache",
    ];

    // Compile regex if needed
    let regex_pattern = if is_regex && !case_sensitive {
        format!("(?i){}", query)
    } else {
        query.clone()
    };
    let regex = if is_regex {
        match regex::Regex::new(&regex_pattern) {
            Ok(r) => Some(r),
            Err(e) => return Err(format!("Invalid regex: {}", e)),
        }
    } else {
        None
    };

    let query_lower = query.to_lowercase();

    while let Some(dir) = stack.pop() {
        if results.len() >= max {
            break;
        }
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries {
            if results.len() >= max {
                break;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                if !skip_dirs.contains(&name.as_str()) {
                    stack.push(path);
                }
            } else {
                // Skip large files (> 1MB) and likely binary files
                if meta.len() > 1_048_576 {
                    continue;
                }
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let binary_exts = [
                    "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "woff", "woff2", "ttf",
                    "eot", "otf", "mp3", "mp4", "wav", "avi", "mov", "zip", "tar", "gz", "rar",
                    "7z", "pdf", "exe", "dll", "so", "dylib", "o", "a", "wasm", "lock",
                ];
                if binary_exts.contains(&ext.as_str()) {
                    continue;
                }

                let file = match fs::File::open(&path) {
                    Ok(f) => f,
                    Err(_) => continue,
                };
                let reader = BufReader::new(file);
                for (line_idx, line_result) in reader.lines().enumerate() {
                    if results.len() >= max {
                        break;
                    }
                    let line = match line_result {
                        Ok(l) => l,
                        Err(_) => break, // likely binary
                    };
                    let matched_col = if let Some(ref re) = regex {
                        re.find(&line).map(|m| m.start())
                    } else if case_sensitive {
                        line.find(&query)
                    } else {
                        line.to_lowercase().find(&query_lower)
                    };

                    if let Some(col) = matched_col {
                        // Whole word check
                        if whole_word && !is_regex {
                            let before = if col > 0 { line.as_bytes().get(col - 1).copied() } else { None };
                            let after = line.as_bytes().get(col + query.len()).copied();
                            let is_word_boundary = |b: Option<u8>| -> bool {
                                match b {
                                    None => true,
                                    Some(c) => !c.is_ascii_alphanumeric() && c != b'_',
                                }
                            };
                            if !is_word_boundary(before) || !is_word_boundary(after) {
                                continue;
                            }
                        }
                        results.push(SearchMatch {
                            path: path.to_string_lossy().to_string(),
                            line_number: line_idx + 1,
                            line_text: line.chars().take(500).collect(),
                            column: col + 1,
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: Option<String>,
}

/// List immediate children of a directory (non-recursive, for lazy tree loading).
#[tauri::command]
pub async fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    let read = fs::read_dir(&dir).map_err(|e| format!("Failed to read {}: {}", path, e))?;

    for item in read {
        let item = match item {
            Ok(i) => i,
            Err(_) => continue,
        };

        let name = item.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs (starting with .)
        // The frontend can toggle this later
        if name.starts_with('.') {
            continue;
        }

        let metadata = match item.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let entry_path = item.path();
        let extension = entry_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        entries.push(DirEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            extension,
        });
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read file contents as UTF-8 text.
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write content to a file (create or overwrite).
#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

/// Reveal a file/folder in Finder (macOS).
#[tauri::command]
pub async fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to reveal: {}", e))?;
    Ok(())
}

/// Delete a file or folder.
#[tauri::command]
pub async fn delete_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| format!("Failed to delete: {}", e))?;
    } else {
        fs::remove_file(&p).map_err(|e| format!("Failed to delete: {}", e))?;
    }
    Ok(())
}

/// Rename a file or folder.
#[tauri::command]
pub async fn rename_path(old_path: String, new_name: String) -> Result<String, String> {
    let old = PathBuf::from(&old_path);
    let new_path = old.parent()
        .ok_or("No parent directory")?
        .join(&new_name);
    fs::rename(&old, &new_path).map_err(|e| format!("Failed to rename: {}", e))?;
    Ok(new_path.to_string_lossy().to_string())
}

/// Create a new file.
#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
    }
    fs::write(&path, "").map_err(|e| format!("Failed to create: {}", e))
}

/// Create a new directory.
#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create: {}", e))
}

/// Recursively list all files in a directory (for Cmd+P file search).
/// Skips hidden dirs, node_modules, target, .git, etc.
#[tauri::command]
pub async fn list_all_files(root: String, max_files: Option<usize>) -> Result<Vec<String>, String> {
    let max = max_files.unwrap_or(10_000);
    let root_path = PathBuf::from(&root);
    let mut files = Vec::new();
    let mut stack = vec![root_path.clone()];

    let skip_dirs = [
        "node_modules", ".git", "target", "dist", "build", ".next",
        "__pycache__", ".venv", "venv", ".cache", ".DS_Store",
    ];

    while let Some(dir) = stack.pop() {
        if files.len() >= max { break; }
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') && name != ".env" { continue; }
            let path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                if !skip_dirs.contains(&name.as_str()) {
                    stack.push(path);
                }
            } else {
                let rel = path.strip_prefix(&root_path)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                files.push(rel);
                if files.len() >= max { break; }
            }
        }
    }

    files.sort();
    Ok(files)
}

/// Install the `caret` CLI command to /usr/local/bin
#[tauri::command]
pub async fn install_cli() -> Result<String, String> {
    let script = r#"#!/bin/bash
APP_BUNDLE="com.voxire.caret"
APP_NAME="Caret"
if [ -z "$1" ]; then
  open -b "$APP_BUNDLE" 2>/dev/null || open -a "$APP_NAME" 2>/dev/null
  exit 0
fi
TARGET=$(cd "$(dirname "$1")" 2>/dev/null && echo "$(pwd)/$(basename "$1")" || echo "$1")
open -b "$APP_BUNDLE" --args "$TARGET" 2>/dev/null || open -a "$APP_NAME" --args "$TARGET" 2>/dev/null
"#;
    let path = "/usr/local/bin/caret";
    fs::write(path, script).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            "Permission denied. Try running: sudo caret install-cli".to_string()
        } else {
            format!("Failed to write {}: {}", path, e)
        }
    })?;
    // Make executable
    std::process::Command::new("chmod")
        .args(["+x", path])
        .output()
        .map_err(|e| format!("Failed to chmod: {}", e))?;
    Ok(format!("CLI installed to {}", path))
}

/// Open a native file picker dialog and return the selected path(s).
#[tauri::command]
pub async fn open_file_dialog(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app
        .dialog()
        .file()
        .blocking_pick_files();

    Ok(files
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.to_string())
        .collect())
}

/// Open a native folder picker dialog and return the selected path.
#[tauri::command]
pub async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder();

    Ok(folder.map(|p| p.to_string()))
}
