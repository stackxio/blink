//! Codex app-server JSON-RPC client.
//!
//! Maintains a persistent `codex app-server` child process and communicates
//! via JSON-RPC over stdin/stdout. Supports multiple concurrent threads with
//! real token-by-token streaming via `item/agentMessage/delta` notifications.
//!
//! Codex maintains conversation context internally within each thread, so
//! only the current user message is sent per turn — no history replay needed.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    id: Option<u64>,
    method: Option<String>,
    result: Option<Value>,
    error: Option<JsonRpcError>,
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

// --- Events emitted to per-turn subscribers ---

#[derive(Debug, Clone)]
pub enum CodexStreamEvent {
    Delta(String),
    TurnCompleted,
    Error(String),
}

// --- Pending request tracking ---

struct PendingRequest {
    tx: oneshot::Sender<Result<Value, String>>,
}

/// Subscriber for streaming events from a specific active turn.
type TurnSubscriber = mpsc::Sender<CodexStreamEvent>;

/// A persistent handle to a running codex app-server process.
///
/// This is meant to be created once at app startup and stored as Tauri managed state.
/// It supports multiple concurrent threads, each mapping to a codex-internal thread.
pub struct CodexServer {
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, PendingRequest>>>,
    /// Maps our internal thread IDs to codex thread IDs.
    thread_map: Arc<Mutex<HashMap<String, String>>>,
    /// Active turn subscribers: maps a turn key to an event sender.
    /// We use the codex thread ID as the key since only one turn runs per thread at a time.
    turn_subscribers: Arc<Mutex<HashMap<String, TurnSubscriber>>>,
    child_pid: Option<u32>,
    initialized: AtomicBool,
}

impl CodexServer {
    /// Spawn `codex app-server` and return a handle.
    pub async fn spawn(codex_binary: &str) -> Result<Self, String> {
        let mut cmd = Command::new(codex_binary);
        cmd.arg("app-server");
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

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

        let pending: Arc<Mutex<HashMap<u64, PendingRequest>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let turn_subscribers: Arc<Mutex<HashMap<String, TurnSubscriber>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // Spawn stdout reader that routes responses and notifications
        let pending_clone = pending.clone();
        let subs_clone = turn_subscribers.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();

            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        let msg = match serde_json::from_str::<JsonRpcMessage>(trimmed) {
                            Ok(m) => m,
                            Err(_) => continue,
                        };

                        // Response to our request
                        if let Some(id) = msg.id {
                            // But only if there's no method — otherwise it's a server request
                            if msg.method.is_none() {
                                let mut pending = pending_clone.lock().await;
                                if let Some(req) = pending.remove(&id) {
                                    if let Some(err) = msg.error {
                                        let _ = req.tx.send(Err(err.message));
                                    } else {
                                        let _ = req.tx.send(Ok(msg.result.unwrap_or(Value::Null)));
                                    }
                                }
                                continue;
                            }
                        }

                        // Notification from codex
                        if let Some(method) = &msg.method {
                            let params = msg.params.as_ref();

                            // Extract the codex thread ID from notification params to route events
                            let codex_thread_id = params
                                .and_then(|p| p.get("threadId").or_else(|| p.get("thread").and_then(|t| t.get("id"))))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            match method.as_str() {
                                "item/agentMessage/delta" => {
                                    if let Some(params) = params {
                                        if let Ok(dp) = serde_json::from_value::<DeltaParams>(params.clone()) {
                                            if let Some(delta) = dp.delta {
                                                if !delta.is_empty() {
                                                    let subs = subs_clone.lock().await;
                                                    if let Some(tx) = subs.get(&codex_thread_id) {
                                                        let _ = tx.send(CodexStreamEvent::Delta(delta)).await;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                "turn/completed" => {
                                    let subs = subs_clone.lock().await;
                                    if let Some(tx) = subs.get(&codex_thread_id) {
                                        let _ = tx.send(CodexStreamEvent::TurnCompleted).await;
                                    }
                                }
                                "error" => {
                                    let error_msg = params
                                        .and_then(|p| p.get("error"))
                                        .and_then(|e| e.get("message"))
                                        .and_then(|m| m.as_str())
                                        .unwrap_or("Unknown codex error")
                                        .to_string();
                                    // Broadcast error to all subscribers if we can't determine thread
                                    if codex_thread_id.is_empty() {
                                        let subs = subs_clone.lock().await;
                                        for tx in subs.values() {
                                            let _ = tx.send(CodexStreamEvent::Error(error_msg.clone())).await;
                                        }
                                    } else {
                                        let subs = subs_clone.lock().await;
                                        if let Some(tx) = subs.get(&codex_thread_id) {
                                            let _ = tx.send(CodexStreamEvent::Error(error_msg)).await;
                                        }
                                    }
                                }
                                _ => {
                                    // Ignore other notifications
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            let _ = child.wait().await;
        });

        Ok(CodexServer {
            stdin: Arc::new(Mutex::new(stdin)),
            next_id: AtomicU64::new(1),
            pending,
            thread_map: Arc::new(Mutex::new(HashMap::new())),
            turn_subscribers,
            child_pid,
            initialized: AtomicBool::new(false),
        })
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

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, PendingRequest { tx });
        }

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

        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Codex request channel closed".to_string()),
            Err(_) => Err("Codex request timed out after 30s".to_string()),
        }
    }

    /// Initialize the codex app-server handshake (only done once).
    pub async fn ensure_initialized(&self) -> Result<(), String> {
        if self.initialized.load(Ordering::SeqCst) {
            return Ok(());
        }

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

        self.initialized.store(true, Ordering::SeqCst);
        Ok(())
    }

    /// Get or create a codex thread for the given internal thread ID.
    /// Returns the codex thread ID.
    pub async fn get_or_create_thread(&self, our_thread_id: &str) -> Result<String, String> {
        // Check if we already have a mapping
        {
            let map = self.thread_map.lock().await;
            if let Some(codex_id) = map.get(our_thread_id) {
                return Ok(codex_id.clone());
            }
        }

        // Create a new codex thread
        let result = self
            .request(
                "thread/start",
                serde_json::json!({
                    "approvalPolicy": "never",
                    "sandbox": "danger-full-access"
                }),
            )
            .await?;

        let codex_thread_id = result
            .get("thread")
            .and_then(|t| t.get("id"))
            .and_then(|id| id.as_str())
            .ok_or("Missing thread.id in response")?
            .to_string();

        // Store mapping
        {
            let mut map = self.thread_map.lock().await;
            map.insert(our_thread_id.to_string(), codex_thread_id.clone());
        }

        Ok(codex_thread_id)
    }

    /// Send a user message and subscribe to streaming events.
    /// Returns (turn_id, event_receiver).
    pub async fn send_turn(
        &self,
        codex_thread_id: &str,
        text: &str,
    ) -> Result<(String, mpsc::Receiver<CodexStreamEvent>), String> {
        // Create subscriber channel for this turn
        let (tx, rx) = mpsc::channel::<CodexStreamEvent>(256);
        {
            let mut subs = self.turn_subscribers.lock().await;
            subs.insert(codex_thread_id.to_string(), tx);
        }

        // Send turn/start
        let result = self
            .request(
                "turn/start",
                serde_json::json!({
                    "threadId": codex_thread_id,
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

        Ok((turn_id, rx))
    }

    /// Remove the turn subscriber for a codex thread (cleanup after turn ends).
    pub async fn remove_subscriber(&self, codex_thread_id: &str) {
        let mut subs = self.turn_subscribers.lock().await;
        subs.remove(codex_thread_id);
    }

    /// Interrupt a running turn.
    pub async fn turn_interrupt(
        &self,
        codex_thread_id: &str,
        turn_id: &str,
    ) -> Result<(), String> {
        self.request(
            "turn/interrupt",
            serde_json::json!({
                "threadId": codex_thread_id,
                "turnId": turn_id
            }),
        )
        .await?;
        Ok(())
    }
}
