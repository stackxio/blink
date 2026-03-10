use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Result};

/// Default prompt files embedded at compile time from core/defaults/prompts/
const DEFAULT_SOUL: &str = include_str!("../../defaults/prompts/soul.md");
const DEFAULT_GUIDELINES: &str = include_str!("../../defaults/prompts/guidelines.md");
const DEFAULT_CONTEXT: &str = include_str!("../../defaults/prompts/context.md");

const DEFAULTS: &[(&str, &str)] = &[
    ("soul.md", DEFAULT_SOUL),
    ("guidelines.md", DEFAULT_GUIDELINES),
    ("context.md", DEFAULT_CONTEXT),
];

/// The system filenames that cannot be deleted (only edited/reset).
const SYSTEM_FILENAMES: &[&str] = &["soul.md", "guidelines.md", "context.md"];

fn prompts_dir() -> PathBuf {
    let home = dirs::home_dir().expect("No home directory found");
    home.join(".caret").join("prompts")
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
}

/// Load all .md files from ~/.caret/prompts/ and return them concatenated
/// as a single system prompt string.
pub fn load_system_prompt() -> String {
    ensure_defaults();

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

    // Load built-in prompts in an intentional order, then any custom prompt files.
    parts.sort_by_key(|(name, _)| match name.as_str() {
        "soul" => (0, name.clone()),
        "guidelines" => (1, name.clone()),
        "context" => (2, name.clone()),
        _ => (3, name.clone()),
    });

    parts
        .into_iter()
        .map(|(_, content)| content.trim().to_string())
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
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

    files.sort_by(|a, b| a.filename.cmp(&b.filename));
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
