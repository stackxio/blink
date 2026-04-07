use crate::settings::prompts;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SkillFile {
    pub filename: String,
    pub content: String,
    pub is_system: bool,
}

/// List all prompt .md files with their content and whether they're system defaults.
#[tauri::command]
pub fn list_skills() -> Result<Vec<SkillFile>, String> {
    prompts::list_prompt_files().map_err(|e| e.to_string())
}

/// Read a single prompt file by filename.
#[tauri::command]
pub fn read_skill(filename: String) -> Result<String, String> {
    prompts::read_prompt_file(&filename).map_err(|e| e.to_string())
}

/// Save (overwrite) a prompt file by filename.
#[tauri::command]
pub fn save_skill(filename: String, content: String) -> Result<(), String> {
    prompts::save_prompt_file(&filename, &content).map_err(|e| e.to_string())
}

/// Create a new prompt file. Fails if it already exists.
#[tauri::command]
pub fn create_skill(filename: String, content: String) -> Result<(), String> {
    prompts::create_prompt_file(&filename, &content).map_err(|e| e.to_string())
}

/// Delete a prompt file. Only allowed for non-system files.
#[tauri::command]
pub fn delete_skill(filename: String) -> Result<(), String> {
    prompts::delete_prompt_file(&filename).map_err(|e| e.to_string())
}

/// Reset all system prompt files to their defaults.
#[tauri::command]
pub fn reset_skills() -> Result<(), String> {
    prompts::reset_defaults().map_err(|e| e.to_string())
}

/// Return all skill files concatenated — used to inject into CLI agent sessions.
#[tauri::command]
pub fn get_combined_skills() -> String {
    prompts::load_system_prompt()
}
