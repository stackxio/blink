use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// JSON lines from the bridge process → webview (`blink-code:bridge`).
#[derive(Clone, Serialize)]
struct BridgeOutEvent {
    line: String,
}

#[derive(Clone, Serialize)]
struct BridgeErrEvent {
    line: String,
}

pub type BlinkCodeBridgeState = std::sync::Arc<Mutex<Option<BridgeSession>>>;

pub fn bridge_state() -> BlinkCodeBridgeState {
    std::sync::Arc::new(Mutex::new(None))
}

pub struct BridgeSession {
    child: Child,
    stdin: tokio::process::ChildStdin,
}

fn default_bridge_script(app: &AppHandle) -> PathBuf {
    // Production: bundled resource shipped with the app
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("ide-bridge.js");
        if bundled.is_file() {
            return bundled;
        }
    }
    // Dev fallback: source TypeScript file relative to the Cargo manifest
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../packages/blink-code/ide-bridge.ts")
        .canonicalize()
        .unwrap_or_else(|_| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../packages/blink-code/ide-bridge.ts")
        })
}

/// Spawns `bun run <bridge_script>` with cwd = workspace. Emits each stdout line as `blink-code:bridge`.
#[tauri::command]
pub async fn blink_code_bridge_start(
    app: AppHandle,
    state: State<'_, BlinkCodeBridgeState>,
    workspace_path: String,
    bridge_script: Option<String>,
    bun_program: Option<String>,
) -> Result<(), String> {
    blink_code_bridge_stop(state.clone()).await?;

    let script = match bridge_script {
        Some(s) if !s.trim().is_empty() => PathBuf::from(s.trim()),
        _ => default_bridge_script(&app),
    };

    if !script.is_file() {
        return Err(format!(
            "Bridge script not found: {}. Add blink-code/ide-bridge.ts or pass a valid bridge_script.",
            script.display()
        ));
    }

    let bun = bun_program
        .filter(|b| !b.trim().is_empty())
        .unwrap_or_else(|| "bun".to_string());

    let script_str = script
        .to_str()
        .ok_or_else(|| "Bridge script path is not valid UTF-8".to_string())?
        .to_string();

    log::info!(
        "blink_code_bridge_start: program={} run {} cwd={}",
        bun,
        script_str,
        workspace_path
    );

    let mut child = Command::new(&bun)
        .arg("run")
        .arg(&script_str)
        .current_dir(&workspace_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn {bun} run {script_str}: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture bridge stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not capture bridge stderr".to_string())?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not capture bridge stdin".to_string())?;

    let app_out = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let _ = app_out.emit(
                        "blink-code:bridge",
                        BridgeOutEvent {
                            line: line.trim_end().to_string(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let app_err = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let _ = app_err.emit(
                        "blink-code:bridge-err",
                        BridgeErrEvent {
                            line: line.trim_end().to_string(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let mut guard = state.lock().await;
    *guard = Some(BridgeSession { child, stdin });
    Ok(())
}

/// Spawns the bridge and immediately writes the init JSONL line to stdin.
/// This avoids UI races where `start` and `send(init)` could interleave.
#[tauri::command]
pub async fn blink_code_bridge_start_with_init(
    app: AppHandle,
    state: State<'_, BlinkCodeBridgeState>,
    workspace_path: String,
    init_line: String,
    bridge_script: Option<String>,
    bun_program: Option<String>,
) -> Result<(), String> {
    blink_code_bridge_stop(state.clone()).await?;

    let script = match bridge_script {
        Some(s) if !s.trim().is_empty() => PathBuf::from(s.trim()),
        _ => default_bridge_script(&app),
    };

    if !script.is_file() {
        return Err(format!(
            "Bridge script not found: {}. Add blink-code/ide-bridge.ts or pass a valid bridge_script.",
            script.display()
        ));
    }

    let bun = bun_program
        .filter(|b| !b.trim().is_empty())
        .unwrap_or_else(|| "bun".to_string());

    let script_str = script
        .to_str()
        .ok_or_else(|| "Bridge script path is not valid UTF-8".to_string())?
        .to_string();

    let mut child = Command::new(&bun)
        .arg("run")
        .arg(&script_str)
        .current_dir(&workspace_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn {bun} run {script_str}: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture bridge stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not capture bridge stderr".to_string())?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not capture bridge stdin".to_string())?;

    let app_out = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let _ = app_out.emit(
                        "blink-code:bridge",
                        BridgeOutEvent {
                            line: line.trim_end().to_string(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let app_err = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let _ = app_err.emit(
                        "blink-code:bridge-err",
                        BridgeErrEvent {
                            line: line.trim_end().to_string(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let mut session = BridgeSession { child, stdin };
    let mut payload = init_line;
    if !payload.ends_with('\n') {
        payload.push('\n');
    }

    session
        .stdin
        .write_all(payload.as_bytes())
        .await
        .map_err(|e| format!("Bridge init stdin write failed: {e}"))?;
    session
        .stdin
        .flush()
        .await
        .map_err(|e| format!("Bridge init stdin flush failed: {e}"))?;

    let mut guard = state.lock().await;
    *guard = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn blink_code_bridge_send(
    state: State<'_, BlinkCodeBridgeState>,
    line: String,
) -> Result<(), String> {
    let mut guard = state.lock().await;
    let session = guard
        .as_mut()
        .ok_or_else(|| "Bridge is not running; start it first.".to_string())?;

    let mut payload = line;
    if !payload.ends_with('\n') {
        payload.push('\n');
    }

    session
        .stdin
        .write_all(payload.as_bytes())
        .await
        .map_err(|e| format!("Bridge stdin write failed: {e}"))?;

    session
        .stdin
        .flush()
        .await
        .map_err(|e| format!("Bridge stdin flush failed: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn blink_code_bridge_stop(state: State<'_, BlinkCodeBridgeState>) -> Result<(), String> {
    let mut guard = state.lock().await;
    if let Some(mut session) = guard.take() {
        let _ = session.child.kill().await;
        let _ = session.child.wait().await;
    }
    Ok(())
}
