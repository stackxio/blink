use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
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

// ── Bridge resolution ─────────────────────────────────────────────────────────

pub enum BridgeExec {
    /// Self-contained compiled binary (production).
    Binary(PathBuf),
    /// `bun run <script>` fallback (development).
    BunScript { bun: String, script: PathBuf },
}

/// Probe common macOS install locations for `bun`.
/// Apps launched from the Dock inherit a minimal launchd PATH that omits
/// /opt/homebrew/bin and ~/.bun/bin, so we check explicitly.
fn find_bun() -> String {
    let mut candidates = vec![
        "/opt/homebrew/bin/bun".to_string(),
        "/usr/local/bin/bun".to_string(),
        "/usr/bin/bun".to_string(),
    ];
    if let Ok(home) = std::env::var("HOME") {
        candidates.push(format!("{home}/.bun/bin/bun"));
        candidates.push(format!("{home}/.local/bin/bun"));
    }
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return path.clone();
        }
    }
    "bun".to_string()
}

/// Resolve how to spawn the bridge.
///
/// Production: use the compiled `blink-bridge` binary bundled in the app's
///   resource directory — no Bun installation required.
/// Development: fall back to `bun run ide-bridge.ts` for fast iteration.
pub fn resolve_bridge(app: &AppHandle) -> Result<BridgeExec, String> {
    // Production path — compiled binary in the app bundle resources.
    #[cfg(not(debug_assertions))]
    {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let bin = resource_dir.join("blink-bridge");
            if bin.is_file() {
                // Ensure the binary is executable (may have lost +x after extraction).
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(
                        &bin,
                        std::fs::Permissions::from_mode(0o755),
                    );
                }
                log::info!("bridge: using bundled binary {}", bin.display());
                return Ok(BridgeExec::Binary(bin));
            }
            log::warn!(
                "bridge: bundled binary not found in {}; falling back to bun",
                resource_dir.display()
            );
        }
    }

    // Suppress unused-variable warning in release builds where the block above
    // always returns.
    let _ = app;

    // Dev / fallback: run the TypeScript source directly with bun.
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../packages/blink-code/ide-bridge.ts");
    let script = script.canonicalize().unwrap_or(script);
    Ok(BridgeExec::BunScript {
        bun: find_bun(),
        script,
    })
}

// ── Shared spawn helper ───────────────────────────────────────────────────────

pub struct SpawnedBridge {
    pub child: Child,
    pub stdin: tokio::process::ChildStdin,
}

pub fn spawn_bridge(exec: &BridgeExec, workspace_path: &str) -> Result<SpawnedBridge, String> {
    let mut cmd = match exec {
        BridgeExec::Binary(bin) => {
            log::info!(
                "blink_code_bridge: exec {} cwd={}",
                bin.display(),
                workspace_path
            );
            Command::new(bin)
        }
        BridgeExec::BunScript { bun, script } => {
            log::info!(
                "blink_code_bridge: {} run {} cwd={}",
                bun,
                script.display(),
                workspace_path
            );
            let mut c = Command::new(bun);
            c.arg("run").arg(
                script
                    .to_str()
                    .ok_or_else(|| "Bridge script path is not valid UTF-8".to_string())?,
            );
            c
        }
    };

    let mut child = cmd
        .current_dir(workspace_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| {
            let label = match exec {
                BridgeExec::Binary(b) => b.display().to_string(),
                BridgeExec::BunScript { bun, script } => {
                    format!("{} run {}", bun, script.display())
                }
            };
            // Give the user an actionable message when Bun is missing in dev mode.
            if e.kind() == std::io::ErrorKind::NotFound {
                if let BridgeExec::BunScript { bun, .. } = exec {
                    return format!(
                        "Could not find '{bun}'. Install Bun (https://bun.sh) or add it to PATH."
                    );
                }
            }
            format!("Failed to spawn bridge ({label}): {e}")
        })?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not capture bridge stdin".to_string())?;

    Ok(SpawnedBridge { child, stdin })
}

fn attach_io_forwarders(app: &AppHandle, child: &mut Child) -> Result<(), String> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture bridge stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not capture bridge stderr".to_string())?;

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

    Ok(())
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Spawns the bridge process. Emits each stdout line as `blink-code:bridge`.
#[tauri::command]
pub async fn blink_code_bridge_start(
    app: AppHandle,
    state: State<'_, BlinkCodeBridgeState>,
    workspace_path: String,
    // Kept for API compatibility; ignored — binary path is resolved internally.
    bridge_script: Option<String>,
    bun_program: Option<String>,
) -> Result<(), String> {
    let _ = (bridge_script, bun_program); // reserved for callers that pass custom overrides
    blink_code_bridge_stop(state.clone()).await?;

    let exec = resolve_bridge(&app)?;
    let mut spawned = spawn_bridge(&exec, &workspace_path)?;
    attach_io_forwarders(&app, &mut spawned.child)?;

    let mut guard = state.lock().await;
    *guard = Some(BridgeSession {
        child: spawned.child,
        stdin: spawned.stdin,
    });
    Ok(())
}

/// Spawns the bridge and immediately writes `init_line` to stdin.
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
    let _ = (bridge_script, bun_program);
    blink_code_bridge_stop(state.clone()).await?;

    let exec = resolve_bridge(&app)?;
    let mut spawned = spawn_bridge(&exec, &workspace_path)?;
    attach_io_forwarders(&app, &mut spawned.child)?;

    let mut payload = init_line;
    if !payload.ends_with('\n') {
        payload.push('\n');
    }
    spawned
        .stdin
        .write_all(payload.as_bytes())
        .await
        .map_err(|e| format!("Bridge init stdin write failed: {e}"))?;
    spawned
        .stdin
        .flush()
        .await
        .map_err(|e| format!("Bridge init stdin flush failed: {e}"))?;

    let mut guard = state.lock().await;
    *guard = Some(BridgeSession {
        child: spawned.child,
        stdin: spawned.stdin,
    });
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
