#[tauri::command]
pub async fn summarize_folder(path: String) -> Result<String, String> {
    // TODO: use FilesystemConnector + AI to summarize folder contents
    let _ = path;
    Err("summarize_folder not yet implemented".to_string())
}

#[tauri::command]
pub async fn organize_downloads() -> Result<String, String> {
    // TODO: use FilesystemConnector + AI to organize the downloads folder
    Err("organize_downloads not yet implemented".to_string())
}

#[tauri::command]
pub async fn rename_file_with_ai(path: String) -> Result<String, String> {
    // TODO: use AI to suggest and apply a better file name
    let _ = path;
    Err("rename_file_with_ai not yet implemented".to_string())
}
