use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Result};
use chrono::Local;

/// Default prompt files embedded at compile time from core/defaults/prompts/
const DEFAULT_IDENTITY: &str = include_str!("../../defaults/prompts/identity.md");
const DEFAULT_SOUL: &str = include_str!("../../defaults/prompts/soul.md");
const DEFAULT_USER: &str = include_str!("../../defaults/prompts/user.md");
const DEFAULT_GUIDELINES: &str = include_str!("../../defaults/prompts/guidelines.md");
const DEFAULT_CONTEXT: &str = include_str!("../../defaults/prompts/context.md");
const DEFAULT_TOOLS: &str = include_str!("../../defaults/prompts/tools.md");

const DEFAULTS: &[(&str, &str)] = &[
    ("identity.md", DEFAULT_IDENTITY),
    ("soul.md", DEFAULT_SOUL),
    ("user.md", DEFAULT_USER),
    ("guidelines.md", DEFAULT_GUIDELINES),
    ("context.md", DEFAULT_CONTEXT),
    ("tools.md", DEFAULT_TOOLS),
];

/// The system filenames that cannot be deleted (only edited/reset).
const SYSTEM_FILENAMES: &[&str] = &[
    "identity.md",
    "soul.md",
    "user.md",
    "guidelines.md",
    "context.md",
    "tools.md",
];

/// Sort priority for built-in prompt files.
fn prompt_sort_key(name: &str) -> u8 {
    match name {
        "identity" => 0,
        "soul" => 1,
        "user" => 2,
        "guidelines" => 3,
        "context" => 4,
        "tools" => 5,
        _ => 10,
    }
}

fn prompts_dir() -> PathBuf {
    let home = dirs::home_dir().expect("No home directory found");
    home.join(".codrift").join("prompts")
}

fn memory_dir() -> PathBuf {
    let home = dirs::home_dir().expect("No home directory found");
    home.join(".codrift").join("memory")
}

fn is_system_file(filename: &str) -> bool {
    SYSTEM_FILENAMES.contains(&filename)
}

/// Ensure the prompts directory exists and copy any missing default files.
pub fn ensure_defaults() {
    let dir = prompts_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    for (filename, content) in DEFAULTS {
        let path = dir.join(filename);
        if !path.exists() {
            let _ = fs::write(&path, content);
        }
    }

    // Also ensure memory directory exists
    let _ = fs::create_dir_all(memory_dir());
}

/// Load the system prompt according to the given mode.
///
/// - `"full"` — all prompt files + today's memory
/// - `"minimal"` — identity + soul only
/// - `"none"` — single identity line
pub fn load_system_prompt_with_mode(mode: &str) -> String {
    ensure_defaults();

    match mode {
        "none" => "You are Blink, an AI operating layer built by Voxire.".to_string(),
        "minimal" => {
            let dir = prompts_dir();
            let mut parts: Vec<String> = Vec::new();
            for name in &["identity", "soul"] {
                let path = dir.join(format!("{}.md", name));
                if let Ok(content) = fs::read_to_string(&path) {
                    let trimmed = content.trim();
                    if !trimmed.is_empty() {
                        parts.push(trimmed.to_string());
                    }
                }
            }
            parts.join("\n\n---\n\n")
        }
        _ => {
            // "full" mode — all prompts + memory
            let dir = prompts_dir();
            let mut parts: Vec<(String, String)> = Vec::new();

            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let name = path
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("")
                                .to_string();
                            parts.push((name, content));
                        }
                    }
                }
            }

            parts.sort_by_key(|(name, _)| (prompt_sort_key(name), name.clone()));

            let mut assembled: Vec<String> = parts
                .into_iter()
                .map(|(_, content)| content.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            // Append today's memory if it exists
            if let Some(memory) = load_today_memory() {
                assembled.push(format!(
                    "# Memory ({})\n\n{}",
                    Local::now().format("%Y-%m-%d"),
                    memory
                ));
            }

            assembled.join("\n\n---\n\n")
        }
    }
}

/// Default full-mode loader (backwards compatible).
pub fn load_system_prompt() -> String {
    load_system_prompt_with_mode("full")
}

// --- Memory system ---

fn today_memory_path() -> PathBuf {
    let date = Local::now().format("%Y-%m-%d").to_string();
    memory_dir().join(format!("{}.md", date))
}

/// Load today's memory file, if it exists.
pub fn load_today_memory() -> Option<String> {
    let path = today_memory_path();
    fs::read_to_string(&path)
        .ok()
        .filter(|s| !s.trim().is_empty())
}

/// Append a line to today's memory file.
pub fn append_memory(text: &str) -> Result<()> {
    let dir = memory_dir();
    fs::create_dir_all(&dir)?;
    let path = today_memory_path();

    let mut content = fs::read_to_string(&path).unwrap_or_default();
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(text);
    content.push('\n');

    fs::write(&path, content)?;
    Ok(())
}

/// List all memory files (date-named .md files).
pub fn list_memory_files() -> Result<Vec<String>> {
    let dir = memory_dir();
    fs::create_dir_all(&dir)?;

    let mut files: Vec<String> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                    files.push(name.to_string());
                }
            }
        }
    }
    files.sort();
    files.reverse(); // Most recent first
    Ok(files)
}

/// Read a specific memory file.
pub fn read_memory_file(filename: &str) -> Result<String> {
    let path = memory_dir().join(filename);
    Ok(fs::read_to_string(path)?)
}

/// Clear today's memory file.
pub fn clear_today_memory() -> Result<()> {
    let path = today_memory_path();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

// --- CRUD for skills panel ---

use crate::commands::skills::SkillFile;

/// List all prompt .md files with metadata.
pub fn list_prompt_files() -> Result<Vec<SkillFile>> {
    ensure_defaults();
    let dir = prompts_dir();
    let mut files: Vec<SkillFile> = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                let filename = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let content = fs::read_to_string(&path).unwrap_or_default();
                files.push(SkillFile {
                    is_system: is_system_file(&filename),
                    filename,
                    content,
                });
            }
        }
    }

    files.sort_by_key(|f| {
        let name = f.filename.trim_end_matches(".md");
        (prompt_sort_key(name), f.filename.clone())
    });
    Ok(files)
}

pub fn read_prompt_file(filename: &str) -> Result<String> {
    ensure_defaults();
    let path = prompts_dir().join(filename);
    Ok(fs::read_to_string(path)?)
}

pub fn save_prompt_file(filename: &str, content: &str) -> Result<()> {
    ensure_defaults();
    let path = prompts_dir().join(filename);
    if !path.exists() {
        bail!("File does not exist: {}", filename);
    }
    fs::write(path, content)?;
    Ok(())
}

pub fn create_prompt_file(filename: &str, content: &str) -> Result<()> {
    ensure_defaults();
    if !filename.ends_with(".md") {
        bail!("Filename must end with .md");
    }
    let path = prompts_dir().join(filename);
    if path.exists() {
        bail!("File already exists: {}", filename);
    }
    fs::write(path, content)?;
    Ok(())
}

pub fn delete_prompt_file(filename: &str) -> Result<()> {
    if is_system_file(filename) {
        bail!("Cannot delete system prompt file: {}", filename);
    }
    let path = prompts_dir().join(filename);
    if !path.exists() {
        bail!("File does not exist: {}", filename);
    }
    fs::remove_file(path)?;
    Ok(())
}

/// Reset all system default files to their original content.
pub fn reset_defaults() -> Result<()> {
    let dir = prompts_dir();
    fs::create_dir_all(&dir)?;

    for (filename, content) in DEFAULTS {
        let path = dir.join(filename);
        fs::write(&path, content)?;
    }
    Ok(())
}
