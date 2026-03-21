use serde::Serialize;
use std::fs;
use std::path::PathBuf;

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
