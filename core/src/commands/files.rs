// AI-driven file operations (summarize_folder, organize_downloads, rename_file_with_ai)
// have been removed. AI logic lives in blink-code.

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Show a native "Quit without saving?" confirm dialog.
/// Returns true if the user confirmed, false if they cancelled.
#[tauri::command]
pub fn show_quit_confirm(app: tauri::AppHandle) -> bool {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
        .message("You have unsaved changes. Quit anyway?")
        .title("Unsaved Changes")
        .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
            "Quit".to_string(),
            "Cancel".to_string(),
        ))
        .blocking_show()
}

/// Open a URL in the system default browser using the `open` command (macOS).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    // Validate that the URL starts with http:// or https:// to prevent arbitrary
    // command injection via the URL string.
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http:// and https:// URLs are supported".to_string());
    }
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}
