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
    include_glob: Option<String>,
    exclude_glob: Option<String>,
) -> Result<Vec<SearchMatch>, String> {
    let max = max_results.unwrap_or(100);
    let case_sensitive = case_sensitive.unwrap_or(false);
    let whole_word = whole_word.unwrap_or(false);
    let is_regex = is_regex.unwrap_or(false);
    let root_path = PathBuf::from(&root);
    let mut results = Vec::new();
    let mut stack = vec![root_path.clone()];

    // Compile glob matchers if provided
    let include_matcher = include_glob
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|pat| glob::Pattern::new(pat).map_err(|e| format!("Invalid include glob: {}", e)))
        .transpose()?;
    let exclude_matcher = exclude_glob
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|pat| glob::Pattern::new(pat).map_err(|e| format!("Invalid exclude glob: {}", e)))
        .transpose()?;

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

                // Apply include/exclude glob filters against the file name
                if let Some(ref inc) = include_matcher {
                    if !inc.matches(&name) {
                        continue;
                    }
                }
                if let Some(ref exc) = exclude_matcher {
                    if exc.matches(&name) {
                        continue;
                    }
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
                            let before = if col > 0 {
                                line.as_bytes().get(col - 1).copied()
                            } else {
                                None
                            };
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

/// Replace all matches of a query across files in a directory.
/// Returns the number of files modified and total replacements made.
#[tauri::command]
pub async fn replace_in_files(
    root: String,
    query: String,
    replacement: String,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    is_regex: Option<bool>,
) -> Result<serde_json::Value, String> {
    let case_sensitive = case_sensitive.unwrap_or(false);
    let whole_word = whole_word.unwrap_or(false);
    let is_regex = is_regex.unwrap_or(false);
    let root_path = PathBuf::from(&root);

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

    // Collect all file paths first
    let mut all_files: Vec<PathBuf> = Vec::new();
    let mut stack = vec![root_path.clone()];
    while let Some(dir) = stack.pop() {
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
                if meta.len() > 1_048_576 {
                    continue;
                }
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let binary_exts = [
                    "png", "jpg", "jpeg", "gif", "bmp", "ico", "woff", "woff2", "ttf", "eot",
                    "otf", "mp3", "mp4", "wav", "avi", "mov", "zip", "tar", "gz", "rar", "7z",
                    "pdf", "exe", "dll", "so", "dylib", "o", "a", "wasm", "lock",
                ];
                if !binary_exts.contains(&ext.as_str()) {
                    all_files.push(path);
                }
            }
        }
    }

    let mut files_modified = 0usize;
    let mut total_replacements = 0usize;

    for file_path in all_files {
        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let (new_content, count) = if let Some(ref re) = regex {
            let mut count = 0usize;
            let result = re.replace_all(&content, |_caps: &regex::Captures| {
                count += 1;
                replacement.clone()
            });
            (result.into_owned(), count)
        } else {
            let mut count = 0usize;
            let mut result = String::new();
            let mut remaining = content.as_str();
            loop {
                let pos = if case_sensitive {
                    remaining.find(&query)
                } else {
                    remaining.to_lowercase().find(&query_lower)
                };
                match pos {
                    None => {
                        result.push_str(remaining);
                        break;
                    }
                    Some(idx) => {
                        if whole_word {
                            let before = if idx > 0 {
                                remaining.as_bytes().get(idx - 1).copied()
                            } else {
                                None
                            };
                            let after = remaining.as_bytes().get(idx + query.len()).copied();
                            let is_word_boundary = |b: Option<u8>| match b {
                                None => true,
                                Some(c) => !c.is_ascii_alphanumeric() && c != b'_',
                            };
                            if !is_word_boundary(before) || !is_word_boundary(after) {
                                result.push_str(&remaining[..idx + 1]);
                                remaining = &remaining[idx + 1..];
                                continue;
                            }
                        }
                        result.push_str(&remaining[..idx]);
                        result.push_str(&replacement);
                        remaining = &remaining[idx + query.len()..];
                        count += 1;
                    }
                }
            }
            (result, count)
        };

        if count > 0 {
            fs::write(&file_path, &new_content)
                .map_err(|e| format!("Failed to write {}: {}", file_path.display(), e))?;
            files_modified += 1;
            total_replacements += count;
        }
    }

    Ok(serde_json::json!({
        "files_modified": files_modified,
        "replacements_made": total_replacements
    }))
}

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: Option<String>,
}

/// Batch-load multiple directories in parallel — one IPC call instead of N.
/// Returns a map of path → entries for every path that is a valid directory.
#[tauri::command]
pub async fn read_dir_batch(paths: Vec<String>) -> Result<std::collections::HashMap<String, Vec<DirEntry>>, String> {
    let handles: Vec<tokio::task::JoinHandle<(String, Vec<DirEntry>)>> = paths
        .into_iter()
        .map(|path| {
            tokio::task::spawn(async move {
                let dir = std::path::PathBuf::from(&path);
                if !dir.is_dir() {
                    return (path, Vec::new());
                }
                let Ok(read) = fs::read_dir(&dir) else {
                    return (path, Vec::new());
                };
                let mut entries = Vec::new();
                for item in read {
                    let Ok(item) = item else { continue };
                    let name = item.file_name().to_string_lossy().to_string();
                    if name.starts_with('.') {
                        continue;
                    }
                    let Ok(metadata) = item.metadata() else { continue };
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
                entries.sort_by(|a, b| {
                    b.is_dir
                        .cmp(&a.is_dir)
                        .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                });
                (path, entries)
            })
        })
        .collect();

    let mut result = std::collections::HashMap::new();
    for handle in handles {
        let (path, entries) = handle.await.map_err(|e| e.to_string())?;
        result.insert(path, entries);
    }
    Ok(result)
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

/// Read file contents as a base64-encoded string (for binary files).
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    Ok(STANDARD.encode(&bytes))
}

/// Write content to a file (create or overwrite).
#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
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
    let new_path = old.parent().ok_or("No parent directory")?.join(&new_name);
    fs::rename(&old, &new_path).map_err(|e| format!("Failed to rename: {}", e))?;
    Ok(new_path.to_string_lossy().to_string())
}

/// Move a file or folder to a different directory (cross-directory drag-drop).
#[tauri::command]
pub async fn move_path(src_path: String, dest_path: String) -> Result<String, String> {
    let dest = PathBuf::from(&dest_path);
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create dest dir: {}", e))?;
        }
    }
    fs::rename(&src_path, &dest_path).map_err(|e| format!("Failed to move: {}", e))?;
    Ok(dest_path)
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
        ".DS_Store",
    ];

    while let Some(dir) = stack.pop() {
        if files.len() >= max {
            break;
        }
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
            if name.starts_with('.') && name != ".env" {
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
                let rel = path
                    .strip_prefix(&root_path)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                files.push(rel);
                if files.len() >= max {
                    break;
                }
            }
        }
    }

    files.sort();
    Ok(files)
}

/// Install the `codrift` CLI command to /usr/local/bin using admin privileges
#[tauri::command]
pub async fn install_cli() -> Result<String, String> {
    let script = r#"#!/bin/bash
APP_BUNDLE="com.stackxio.codrift"
APP_NAME="Codrift"

# Find the installed app binary (launching it directly lets the single-instance
# plugin forward the path to a running instance rather than just raising the window)
BINARY=""
for loc in "/Applications/Codrift.app" "$HOME/Applications/Codrift.app"; do
  if [ -x "$loc/Contents/MacOS/Codrift" ]; then
    BINARY="$loc/Contents/MacOS/Codrift"
    break
  fi
done

if [ -z "$1" ]; then
  open -b "$APP_BUNDLE" 2>/dev/null || open -a "$APP_NAME" 2>/dev/null
  exit 0
fi

# Resolve argument to an absolute path
if [ -d "$1" ]; then
  TARGET=$(cd "$1" 2>/dev/null && pwd)
elif [ -f "$1" ]; then
  TARGET=$(cd "$(dirname "$1")" 2>/dev/null && echo "$(pwd)/$(basename "$1")")
else
  echo "codrift: '$1': No such file or directory" >&2
  exit 1
fi

if [ -n "$BINARY" ]; then
  # Launch binary directly — single-instance plugin forwards args to running instance
  nohup "$BINARY" "$TARGET" >/dev/null 2>&1 &
  disown
else
  open -b "$APP_BUNDLE" --args "$TARGET" 2>/dev/null || open -a "$APP_NAME" --args "$TARGET" 2>/dev/null
fi
"#;
    // Write to a temp file first, then use osascript to move with admin privileges
    let tmp = "/tmp/codrift-cli-install";
    fs::write(tmp, script).map_err(|e| format!("Failed to write temp file: {}", e))?;

    let output = std::process::Command::new("osascript")
        .args([
            "-e",
            "do shell script \"cp /tmp/codrift-cli-install /usr/local/bin/codrift && chmod +x /usr/local/bin/codrift\" with administrator privileges",
        ])
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    let _ = fs::remove_file(tmp);

    if output.status.success() {
        Ok("CLI installed to /usr/local/bin/codrift".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!(
            "Installation cancelled or failed: {}",
            stderr.trim()
        ))
    }
}

/// Open a native file picker dialog and return the selected path(s).
#[tauri::command]
pub async fn open_file_dialog(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app.dialog().file().blocking_pick_files();

    Ok(files
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.to_string())
        .collect())
}

/// Check whether a path is a directory.
#[tauri::command]
pub fn is_dir(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Open a native folder picker dialog and return the selected path.
#[tauri::command]
pub async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();

    Ok(folder.map(|p| p.to_string()))
}

/// Read the `.codrift.json` workspace config from the given workspace root.
/// Returns the raw JSON string if the file exists, or None if it does not.
#[tauri::command]
pub async fn read_workspace_config(workspace_path: String) -> Result<Option<String>, String> {
    let config_path = std::path::PathBuf::from(&workspace_path).join(".codrift.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read .codrift.json: {}", e))?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}
