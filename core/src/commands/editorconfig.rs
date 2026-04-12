use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct EditorConfigResult {
    pub insert_spaces: Option<bool>,
    pub tab_size: Option<u32>,
    pub trim_trailing_whitespace: Option<bool>,
    pub end_of_line: Option<String>,
}

/// Walk up the directory tree from `file_path` looking for a `.editorconfig` file.
/// Parse it (INI-style) and return settings matching the file's name/extension.
#[tauri::command]
pub fn read_editorconfig(file_path: String) -> Result<EditorConfigResult, String> {
    let path = PathBuf::from(&file_path);
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    // Walk up directory tree
    let mut dir = path.parent().map(|p| p.to_path_buf());

    while let Some(current_dir) = dir {
        let ec_path = current_dir.join(".editorconfig");
        if ec_path.exists() {
            let result = parse_editorconfig(&ec_path, &file_name)?;
            return Ok(result);
        }

        // Check if we've hit the root
        dir = current_dir.parent().map(|p| p.to_path_buf());
    }

    // No .editorconfig found — return empty result
    Ok(EditorConfigResult {
        insert_spaces: None,
        tab_size: None,
        trim_trailing_whitespace: None,
        end_of_line: None,
    })
}

/// Parse an `.editorconfig` file and extract settings for the given filename.
fn parse_editorconfig(ec_path: &Path, file_name: &str) -> Result<EditorConfigResult, String> {
    let content = fs::read_to_string(ec_path)
        .map_err(|e| format!("Failed to read .editorconfig: {}", e))?;

    let mut insert_spaces: Option<bool> = None;
    let mut tab_size: Option<u32> = None;
    let mut trim_trailing_whitespace: Option<bool> = None;
    let mut end_of_line: Option<String> = None;

    // Track current section and whether it matches our file
    let mut in_matching_section = false;

    for line in content.lines() {
        let line = line.trim();

        // Skip comments and empty lines
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }

        // Section header
        if line.starts_with('[') && line.ends_with(']') {
            let pattern = &line[1..line.len() - 1];
            in_matching_section = glob_matches(pattern, file_name);
            continue;
        }

        // Key-value pair
        if !in_matching_section {
            continue;
        }

        if let Some((key, value)) = parse_key_value(line) {
            match key.as_str() {
                "indent_style" => match value.as_str() {
                    "space" => insert_spaces = Some(true),
                    "tab" => insert_spaces = Some(false),
                    _ => {}
                },
                "indent_size" | "tab_width" => {
                    if let Ok(n) = value.parse::<u32>() {
                        tab_size = Some(n);
                    }
                }
                "trim_trailing_whitespace" => match value.as_str() {
                    "true" => trim_trailing_whitespace = Some(true),
                    "false" => trim_trailing_whitespace = Some(false),
                    _ => {}
                },
                "end_of_line" => match value.as_str() {
                    "lf" | "crlf" | "cr" => end_of_line = Some(value),
                    _ => {}
                },
                _ => {}
            }
        }
    }

    Ok(EditorConfigResult {
        insert_spaces,
        tab_size,
        trim_trailing_whitespace,
        end_of_line,
    })
}

/// Parse a `key = value` line, trimming whitespace and lowercasing the key.
fn parse_key_value(line: &str) -> Option<(String, String)> {
    let eq_pos = line.find('=')?;
    let key = line[..eq_pos].trim().to_lowercase();
    let value = line[eq_pos + 1..].trim().to_lowercase();
    if key.is_empty() || value.is_empty() {
        return None;
    }
    Some((key, value))
}

/// Simple glob matching for editorconfig patterns against a filename.
/// Supports `*`, `**`, `?`, `{a,b}` and `[...]` via the `glob` crate.
/// The pattern may optionally be path-qualified (e.g. `src/*.ts`); we only
/// check the file name part when there's no path separator in the pattern.
fn glob_matches(pattern: &str, file_name: &str) -> bool {
    // `[*]` is a literal catch-all that matches every file
    if pattern == "*" {
        return true;
    }

    // If the pattern contains a path separator, try to match the full path
    // (not currently needed for tab/space decisions, but correct per spec).
    // For simplicity we just match against the file name when no '/' present.
    let match_target = if pattern.contains('/') {
        file_name // fall back; proper impl would need full path
    } else {
        file_name
    };

    // Use the glob crate for proper glob semantics
    if let Ok(pat) = glob::Pattern::new(pattern) {
        return pat.matches(match_target);
    }

    false
}
