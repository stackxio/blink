use crate::lsp::manager::{self, LspState};
use crate::lsp::registry;
use serde::Serialize;
use serde_json::Value;

/// Start an LSP server for a given file extension.
#[tauri::command]
pub async fn lsp_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, LspState>,
    extension: String,
    workspace_root: Option<String>,
) -> Result<String, String> {
    manager::ensure_server(&state, &app, &extension, workspace_root.as_deref())
}

/// Send a JSON-RPC request to an LSP server. Returns the request ID.
#[tauri::command]
pub async fn lsp_request(
    state: tauri::State<'_, LspState>,
    lang_id: String,
    method: String,
    params: Value,
) -> Result<i64, String> {
    manager::send_request(&state, &lang_id, &method, params)
}

/// Send a JSON-RPC notification to an LSP server.
#[tauri::command]
pub async fn lsp_notify(
    state: tauri::State<'_, LspState>,
    lang_id: String,
    method: String,
    params: Value,
) -> Result<(), String> {
    manager::send_notification(&state, &lang_id, &method, params)
}

/// Stop an LSP server.
#[tauri::command]
pub async fn lsp_stop(state: tauri::State<'_, LspState>, lang_id: String) -> Result<(), String> {
    manager::stop_server(&state, &lang_id)
}

/// List all known LSP servers with their install status.
#[derive(Serialize)]
pub struct ServerStatus {
    pub language_id: String,
    pub display_name: String,
    pub extensions: Vec<String>,
    pub command: String,
    pub installed: bool,
    pub install_command: String,
    pub install_method: String,
}

#[tauri::command]
pub async fn lsp_list_installed() -> Result<Vec<String>, String> {
    Ok(registry::installed_servers()
        .iter()
        .map(|s| s.language_id.to_string())
        .collect())
}

#[tauri::command]
pub async fn lsp_list_all_servers() -> Result<Vec<ServerStatus>, String> {
    Ok(registry::KNOWN_SERVERS
        .iter()
        .map(|s| ServerStatus {
            language_id: s.language_id.to_string(),
            display_name: s.display_name.to_string(),
            extensions: s.extensions.iter().map(|e| e.to_string()).collect(),
            command: s.command.to_string(),
            installed: registry::resolve_server_path(s.command).is_some(),
            install_command: s.install_command.to_string(),
            install_method: s.install_method.to_string(),
        })
        .collect())
}

/// Install a language server by running its install command.
#[tauri::command]
pub async fn lsp_install_server(
    app: tauri::AppHandle,
    language_id: String,
) -> Result<String, String> {
    use tauri::Emitter;

    let server = registry::KNOWN_SERVERS
        .iter()
        .find(|s| s.language_id == language_id)
        .ok_or_else(|| format!("Unknown language: {}", language_id))?;

    let _ = app.emit(
        "lsp:install:status",
        serde_json::json!({
            "language_id": language_id,
            "status": "installing",
        }),
    );

    // Install to ~/.blink/servers/ to avoid polluting global env
    let servers_dir = dirs::home_dir()
        .ok_or("No home directory")?
        .join(".blink")
        .join("servers");
    std::fs::create_dir_all(&servers_dir).map_err(|e| e.to_string())?;

    // For npm-based servers, install locally
    let install_cmd = if server.install_method == "npm" {
        format!(
            "cd {} && npm install {}",
            servers_dir.to_string_lossy(),
            server
                .install_command
                .strip_prefix("npm install -g ")
                .unwrap_or(server.install_command)
        )
    } else {
        server.install_command.to_string()
    };

    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&install_cmd)
        .output()
        .map_err(|e| format!("Failed to run install: {}", e))?;

    if output.status.success() {
        let _ = app.emit(
            "lsp:install:status",
            serde_json::json!({
                "language_id": language_id,
                "status": "installed",
            }),
        );
        Ok(format!("{} installed successfully", server.display_name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = app.emit(
            "lsp:install:status",
            serde_json::json!({
                "language_id": language_id,
                "status": "failed",
                "error": &stderr,
            }),
        );
        Err(format!("Install failed: {}", stderr))
    }
}
