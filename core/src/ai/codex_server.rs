//! Codex app-server JSON-RPC client.
//!
//! Spawns `codex app-server` as a persistent child process and communicates
//! via JSON-RPC over stdin/stdout. This enables real token-by-token streaming
//! via `item/agentMessage/delta` notifications.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

// --- JSON-RPC types ---

#[derive(Serialize)]
struct JsonRpcRequest {
    id: u64,
    method: String,
    params: Value,
}

#[derive(Deserialize, Debug)]
struct JsonRpcMessage {
    /// Present on responses to our requests
    id: Option<u64>,
    /// Present on notifications from codex
    method: Option<String>,
    /// Response result
    result: Option<Value>,
    /// Response error
    error: Option<JsonRpcError>,
    /// Notification params
    params: Option<Value>,
}

#[derive(Deserialize, Debug)]
struct JsonRpcError {
    message: String,
}

// --- Codex notification params ---

#[derive(Deserialize, Debug)]
struct DeltaParams {
    delta: Option<String>,
}

#[derive(Deserialize, Debug)]
struct TurnCompletedParams {
    turn: Option<TurnInfo>,
}

#[derive(Deserialize, Debug)]
struct TurnInfo {
    status: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ThreadStartedParams {
    thread: Option<ThreadInfo>,
}

#[derive(Deserialize, Debug)]
struct ThreadInfo {
    id: Option<String>,
}

// --- Events emitted to the caller ---

#[derive(Debug)]
pub enum CodexStreamEvent {
    Delta(String),
    TurnCompleted,
    Error(String),
}

// --- Pending request tracking ---

struct PendingRequest {
    tx: oneshot::Sender<Result<Value, String>>,
}

/// A handle to a running codex app-server process.
pub struct CodexServer {
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    next_id: AtomicU64,
    pending: Arc<Mutex<std::collections::HashMap<u64, PendingRequest>>>,
    event_tx: mpsc::Sender<CodexStreamEvent>,
    child_pid: Option<u32>,
}

impl CodexServer {
    /// Spawn `codex app-server` and return a handle + event receiver.
    ///
    /// The event receiver will yield `CodexStreamEvent` items as they arrive
    /// from the codex process (deltas, completion, errors).
    pub async fn spawn(
        codex_binary: &str,
        cwd: Option<&str>,
    ) -> Result<(Self, mpsc::Receiver<CodexStreamEvent>), String> {
        let mut cmd = Command::new(codex_binary);
        cmd.arg("app-server");
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        let mut child: Child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn codex app-server: {}", e))?;

        let child_pid = child.id();

        let stdin = child
            .stdin
            .take()
            .ok_or("Failed to capture codex stdin")?;

        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture codex stdout")?;

        let (event_tx, event_rx) = mpsc::channel::<CodexStreamEvent>(256);
        let pending: Arc<Mutex<std::collections::HashMap<u64, PendingRequest>>> =
            Arc::new(Mutex::new(std::collections::HashMap::new()));

        // Spawn stdout reader
        let pending_clone = pending.clone();
        let event_tx_clone = event_tx.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();

            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        if let Ok(msg) = serde_json::from_str::<JsonRpcMessage>(trimmed) {
                            // Response to our request
                            if let Some(id) = msg.id {
                                let mut pending = pending_clone.lock().await;
                                if let Some(req) = pending.remove(&id) {
                                    if let Some(err) = msg.error {
                                        let _ = req.tx.send(Err(err.message));
                                    } else {
                                        let _ = req
                                            .tx
                                            .send(Ok(msg.result.unwrap_or(Value::Null)));
                                    }
                                }
                                continue;
                            }

                            // Notification from codex
                            if let Some(method) = &msg.method {
                                match method.as_str() {
                                    "item/agentMessage/delta" => {
                                        if let Some(params) = &msg.params {
                                            if let Ok(delta_params) =
                                                serde_json::from_value::<DeltaParams>(
                                                    params.clone(),
                                                )
                                            {
                                                if let Some(delta) = delta_params.delta {
                                                    if !delta.is_empty() {
                                                        let _ = event_tx_clone
                                                            .send(CodexStreamEvent::Delta(
                                                                delta,
                                                            ))
                                                            .await;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    "turn/completed" => {
                                        let _ = event_tx_clone
                                            .send(CodexStreamEvent::TurnCompleted)
                                            .await;
                                    }
                                    "error" => {
                                        let error_msg = msg
                                            .params
                                            .as_ref()
                                            .and_then(|p| p.get("error"))
                                            .and_then(|e| e.get("message"))
                                            .and_then(|m| m.as_str())
                                            .unwrap_or("Unknown codex error")
                                            .to_string();
                                        let _ = event_tx_clone
                                            .send(CodexStreamEvent::Error(error_msg))
                                            .await;
                                    }
                                    _ => {
                                        // Ignore other notifications (thread/started, turn/started, etc.)
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            // Process ended — signal completion
            let _ = child.wait().await;
        });

        let server = CodexServer {
            stdin: Arc::new(Mutex::new(stdin)),
            next_id: AtomicU64::new(1),
            pending,
            event_tx,
            child_pid,
        };

        Ok((server, event_rx))
    }

    pub fn pid(&self) -> Option<u32> {
        self.child_pid
    }

    /// Send a JSON-RPC request and wait for the response.
    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);

        let req = JsonRpcRequest {
            id,
            method: method.to_string(),
            params,
        };

        let mut json_str =
            serde_json::to_string(&req).map_err(|e| format!("JSON encode error: {}", e))?;
        json_str.push('\n');

        // Register pending request before writing
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, PendingRequest { tx });
        }

        // Write to stdin
        {
            let mut stdin = self.stdin.lock().await;
            stdin
                .write_all(json_str.as_bytes())
                .await
                .map_err(|e| format!("Failed to write to codex stdin: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Failed to flush codex stdin: {}", e))?;
        }

        // Wait for response with timeout
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Codex request channel closed".to_string()),
            Err(_) => Err("Codex request timed out after 30s".to_string()),
        }
    }

    /// Initialize the codex app-server handshake.
    pub async fn initialize(&self) -> Result<(), String> {
        self.request(
            "initialize",
            serde_json::json!({
                "clientInfo": {
                    "name": "caret",
                    "title": "Caret",
                    "version": "0.1.0"
                },
                "capabilities": {
                    "experimentalApi": false
                }
            }),
        )
        .await?;
        Ok(())
    }

    /// Start a new thread. Returns the codex thread ID.
    pub async fn thread_start(&self) -> Result<String, String> {
        let result = self
            .request(
                "thread/start",
                serde_json::json!({
                    "approvalPolicy": "never",
                    "sandbox": "danger-full-access"
                }),
            )
            .await?;

        let thread_id = result
            .get("thread")
            .and_then(|t| t.get("id"))
            .and_then(|id| id.as_str())
            .ok_or("Missing thread.id in response")?
            .to_string();

        Ok(thread_id)
    }

    /// Start a new turn (send a user message). Returns the turn ID.
    pub async fn turn_start(
        &self,
        thread_id: &str,
        text: &str,
    ) -> Result<String, String> {
        let result = self
            .request(
                "turn/start",
                serde_json::json!({
                    "threadId": thread_id,
                    "input": [
                        {
                            "type": "text",
                            "text": text,
                            "text_elements": []
                        }
                    ]
                }),
            )
            .await?;

        let turn_id = result
            .get("turn")
            .and_then(|t| t.get("id"))
            .and_then(|id| id.as_str())
            .unwrap_or("unknown")
            .to_string();

        Ok(turn_id)
    }

    /// Interrupt a running turn.
    pub async fn turn_interrupt(
        &self,
        thread_id: &str,
        turn_id: &str,
    ) -> Result<(), String> {
        self.request(
            "turn/interrupt",
            serde_json::json!({
                "threadId": thread_id,
                "turnId": turn_id
            }),
        )
        .await?;
        Ok(())
    }
}
