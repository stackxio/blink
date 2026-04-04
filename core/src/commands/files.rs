// AI-driven file operations (summarize_folder, organize_downloads, rename_file_with_ai)
// have been removed. AI logic lives in blink-code.

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}
