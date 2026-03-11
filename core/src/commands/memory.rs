use crate::settings::prompts;

#[tauri::command]
pub fn list_memory_files() -> Result<Vec<String>, String> {
    prompts::list_memory_files().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_memory_file(filename: String) -> Result<String, String> {
    prompts::read_memory_file(&filename).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn append_memory(text: String) -> Result<(), String> {
    prompts::append_memory(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_today_memory() -> Result<(), String> {
    prompts::clear_today_memory().map_err(|e| e.to_string())
}
