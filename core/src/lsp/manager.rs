use std::collections::HashMap;
use std::io::BufReader;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter};

use super::registry::{resolve_server_path, server_for_extension};
use super::transport;

struct LspServer {
    _process: Child,
    stdin: std::process::ChildStdin,
    next_id: i64,
}

pub struct LspManager {
    servers: HashMap<String, LspServer>, // keyed by language_id
}

impl LspManager {
    pub fn new() -> Self {
        Self {
            servers: HashMap::new(),
        }
    }
}

pub type LspState = Arc<Mutex<LspManager>>;

pub fn create_lsp_state() -> LspState {
    Arc::new(Mutex::new(LspManager::new()))
}

/// Start an LSP server for a file extension, if not already running.
/// Returns the language_id if successful.
pub fn ensure_server(
    state: &LspState,
    app: &AppHandle,
    ext: &str,
    workspace_root: Option<&str>,
) -> Result<String, String> {
    let info = server_for_extension(ext)
        .ok_or_else(|| format!("No LSP server known for .{}", ext))?;

    let lang_id = info.language_id.to_string();

    // Already running?
    {
        let mgr = state.lock().map_err(|e| e.to_string())?;
        if mgr.servers.contains_key(&lang_id) {
            return Ok(lang_id);
        }
    }

    // Resolve the server binary (checks ~/.caret/servers/ then PATH)
    let server_bin = resolve_server_path(info.command)
        .ok_or_else(|| format!(
            "{} not found. Install it from the Extensions page to enable {} support.",
            info.command, info.language_id
        ))?;

    // Spawn the server
    let mut cmd = Command::new(&server_bin);
    cmd.args(info.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    if let Some(root) = workspace_root {
        cmd.current_dir(root);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", info.command, e))?;

    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;

    // Background reader: parse LSP messages from stdout → emit Tauri events
    let app_handle = app.clone();
    let lang = lang_id.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Some(msg) = transport::read_message(&mut reader) {
            // Emit as a Tauri event — the frontend will parse and route it
            let _ = app_handle.emit(&format!("lsp:message:{}", lang), &msg);
        }
    });

    // Send initialize request
    let root_uri = workspace_root
        .map(|r| format!("file://{}", r))
        .unwrap_or_default();

    let init_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "processId": std::process::id(),
            "rootUri": root_uri,
            "capabilities": {
                "textDocument": {
                    "completion": {
                        "completionItem": {
                            "snippetSupport": false
                        }
                    },
                    "hover": {},
                    "publishDiagnostics": {
                        "relatedInformation": true
                    },
                    "definition": {},
                    "references": {}
                }
            }
        }
    });

    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        let server = LspServer {
            _process: child,
            stdin,
            next_id: 2, // 1 was used for initialize
        };

        transport::write_message(
            &mut mgr.servers.entry(lang_id.clone()).or_insert(server).stdin,
            &init_request.to_string(),
        )
        .map_err(|e| format!("Failed to send initialize: {}", e))?;
    }

    Ok(lang_id)
}

/// Send a request to an LSP server and return the request ID.
pub fn send_request(
    state: &LspState,
    lang_id: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<i64, String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    let server = mgr
        .servers
        .get_mut(lang_id)
        .ok_or_else(|| format!("No LSP server running for {}", lang_id))?;

    let id = server.next_id;
    server.next_id += 1;

    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });

    transport::write_message(&mut server.stdin, &msg.to_string())
        .map_err(|e| format!("Failed to send request: {}", e))?;

    Ok(id)
}

/// Send a notification to an LSP server (no response expected).
pub fn send_notification(
    state: &LspState,
    lang_id: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    let server = mgr
        .servers
        .get_mut(lang_id)
        .ok_or_else(|| format!("No LSP server running for {}", lang_id))?;

    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    });

    transport::write_message(&mut server.stdin, &msg.to_string())
        .map_err(|e| format!("Failed to send notification: {}", e))?;

    Ok(())
}

/// Stop a running LSP server.
pub fn stop_server(state: &LspState, lang_id: &str) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    if let Some(mut server) = mgr.servers.remove(lang_id) {
        // Send shutdown request
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 9999,
            "method": "shutdown",
            "params": null
        });
        let _ = transport::write_message(&mut server.stdin, &msg.to_string());

        // Send exit notification
        let exit = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "exit",
            "params": null
        });
        let _ = transport::write_message(&mut server.stdin, &exit.to_string());
    }
    Ok(())
}
