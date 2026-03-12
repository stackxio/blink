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

// --- JSON-RPC types (Codex-specific wire format) ---

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

#[derive(Deserialize, Debug)]
struct DeltaParams {
    delta: Option<String>,
}

// --- Events emitted to per-turn subscribers ---

#[derive(Debug, Clone)]
pub enum CodexStreamEvent {
    Delta(String),
    Activity(ActivityEvent),
    TurnCompleted,
    Error(String),
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityEvent {
    pub kind: String,
    pub title: String,
    pub detail: Option<String>,
}

struct PendingRequest {
    tx: oneshot::Sender<Result<Value, String>>,
}

type TurnSubscriber = mpsc::Sender<CodexStreamEvent>;

/// A persistent handle to a running codex app-server process.
///
/// Created once at app startup and stored as Tauri managed state.
/// Supports multiple concurrent threads, each mapping to a codex-internal thread.
pub struct CodexServer {
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, PendingRequest>>>,
    thread_map: Arc<Mutex<HashMap<String, String>>>,
    prompted_threads: Arc<Mutex<std::collections::HashSet<String>>>,
    turn_subscribers: Arc<Mutex<HashMap<String, TurnSubscriber>>>,
    child_pid: Option<u32>,
    initialized: AtomicBool,
}

impl CodexServer {
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

        let stdin = child.stdin.take().ok_or("Failed to capture codex stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture codex stdout")?;

        let pending: Arc<Mutex<HashMap<u64, PendingRequest>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let turn_subscribers: Arc<Mutex<HashMap<String, TurnSubscriber>>> =
            Arc::new(Mutex::new(HashMap::new()));

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

                        if let Some(id) = msg.id {
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

                        if let Some(method) = &msg.method {
                            let params = msg.params.as_ref();

                            let codex_thread_id = params
                                .and_then(|p| {
                                    p.get("threadId")
                                        .or_else(|| p.get("thread").and_then(|t| t.get("id")))
                                })
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            match method.as_str() {
                                "item/agentMessage/delta" => {
                                    if let Some(params) = params {
                                        if let Ok(dp) =
                                            serde_json::from_value::<DeltaParams>(params.clone())
                                        {
                                            if let Some(delta) = dp.delta {
                                                if !delta.is_empty() {
                                                    let subs = subs_clone.lock().await;
                                                    if let Some(tx) = subs.get(&codex_thread_id) {
                                                        let _ = tx
                                                            .send(CodexStreamEvent::Delta(delta))
                                                            .await;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                "item/started" | "item/completed" => {
                                    if let Some(activity) = parse_activity(params, method.as_str())
                                    {
                                        let subs = subs_clone.lock().await;
                                        if let Some(tx) = subs.get(&codex_thread_id) {
                                            let _ =
                                                tx.send(CodexStreamEvent::Activity(activity)).await;
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
                                    if codex_thread_id.is_empty() {
                                        let subs = subs_clone.lock().await;
                                        for tx in subs.values() {
                                            let _ = tx
                                                .send(CodexStreamEvent::Error(error_msg.clone()))
                                                .await;
                                        }
                                    } else {
                                        let subs = subs_clone.lock().await;
                                        if let Some(tx) = subs.get(&codex_thread_id) {
                                            let _ =
                                                tx.send(CodexStreamEvent::Error(error_msg)).await;
                                        }
                                    }
                                }
                                _ => {}
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
            prompted_threads: Arc::new(Mutex::new(std::collections::HashSet::new())),
            turn_subscribers,
            child_pid,
            initialized: AtomicBool::new(false),
        })
    }

    pub fn pid(&self) -> Option<u32> {
        self.child_pid
    }

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

    pub async fn get_or_create_thread(
        &self,
        our_thread_id: &str,
        stored_codex_id: Option<&str>,
    ) -> Result<(String, bool), String> {
        {
            let map = self.thread_map.lock().await;
            if let Some(codex_id) = map.get(our_thread_id) {
                return Ok((codex_id.clone(), false));
            }
        }

        if let Some(stored_id) = stored_codex_id {
            if let Ok(result) = self
                .request(
                    "thread/resume",
                    serde_json::json!({
                        "threadId": stored_id,
                        "approvalPolicy": "never",
                        "sandbox": "danger-full-access"
                    }),
                )
                .await
            {
                let codex_thread_id = result
                    .get("thread")
                    .and_then(|t| t.get("id"))
                    .and_then(|id| id.as_str())
                    .unwrap_or(stored_id)
                    .to_string();

                let mut map = self.thread_map.lock().await;
                map.insert(our_thread_id.to_string(), codex_thread_id.clone());

                let mut prompted = self.prompted_threads.lock().await;
                prompted.insert(codex_thread_id.clone());

                return Ok((codex_thread_id, false));
            }
        }

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

        let mut map = self.thread_map.lock().await;
        map.insert(our_thread_id.to_string(), codex_thread_id.clone());

        Ok((codex_thread_id, true))
    }

    pub async fn needs_system_prompt(&self, codex_thread_id: &str) -> bool {
        let prompted = self.prompted_threads.lock().await;
        !prompted.contains(codex_thread_id)
    }

    pub async fn mark_prompted(&self, codex_thread_id: &str) {
        let mut prompted = self.prompted_threads.lock().await;
        prompted.insert(codex_thread_id.to_string());
    }

    pub async fn send_turn(
        &self,
        codex_thread_id: &str,
        text: &str,
        reasoning_effort: Option<&str>,
        fast_mode: Option<bool>,
        model: Option<&str>,
    ) -> Result<(String, mpsc::Receiver<CodexStreamEvent>), String> {
        let (tx, rx) = mpsc::channel::<CodexStreamEvent>(256);
        {
            let mut subs = self.turn_subscribers.lock().await;
            subs.insert(codex_thread_id.to_string(), tx);
        }

        let mut params = serde_json::json!({
            "threadId": codex_thread_id,
            "input": [
                {
                    "type": "text",
                    "text": text,
                    "text_elements": []
                }
            ]
        });
        if let Some(obj) = params.as_object_mut() {
            if let Some(effort) = reasoning_effort {
                obj.insert(
                    "reasoningEffort".to_string(),
                    serde_json::Value::String(effort.to_string()),
                );
            }
            if let Some(fast) = fast_mode {
                obj.insert("fastMode".to_string(), serde_json::Value::Bool(fast));
            }
            if let Some(m) = model {
                if !m.is_empty() {
                    obj.insert(
                        "model".to_string(),
                        serde_json::Value::String(m.to_string()),
                    );
                }
            }
        }

        let result = self.request("turn/start", params).await?;

        let turn_id = result
            .get("turn")
            .and_then(|t| t.get("id"))
            .and_then(|id| id.as_str())
            .unwrap_or("unknown")
            .to_string();

        Ok((turn_id, rx))
    }

    pub async fn remove_subscriber(&self, codex_thread_id: &str) {
        let mut subs = self.turn_subscribers.lock().await;
        subs.remove(codex_thread_id);
    }

    pub async fn turn_interrupt(&self, codex_thread_id: &str, turn_id: &str) -> Result<(), String> {
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

// --- Activity parsing helpers (Codex-specific notification format) ---

fn classify_item_type(raw: &str) -> Option<&'static str> {
    let lower = raw.to_lowercase();
    if lower.contains("command") {
        Some("command")
    } else if lower.contains("file change") || lower.contains("patch") || lower.contains("edit") {
        Some("file_change")
    } else if lower.contains("file") && lower.contains("read") {
        Some("file_read")
    } else if lower.contains("web search") {
        Some("web_search")
    } else if lower.contains("mcp") || lower.contains("dynamic tool") {
        Some("tool_call")
    } else {
        None
    }
}

fn item_type_title(kind: &str) -> &'static str {
    match kind {
        "command" => "Ran command",
        "file_change" => "Edited file",
        "file_read" => "Read file",
        "web_search" => "Searched the web",
        "tool_call" => "Used tool",
        _ => "Working",
    }
}

fn extract_detail(source: &Value) -> Option<String> {
    let candidates = [
        source.get("command").and_then(|v| v.as_str()),
        source.get("title").and_then(|v| v.as_str()),
        source.get("summary").and_then(|v| v.as_str()),
        source.get("path").and_then(|v| v.as_str()),
        source.get("text").and_then(|v| v.as_str()),
        source.get("prompt").and_then(|v| v.as_str()),
    ];
    for candidate in candidates {
        if let Some(s) = candidate {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn parse_activity(params: Option<&Value>, method: &str) -> Option<ActivityEvent> {
    let params = params?;
    let item = params.get("item").unwrap_or(params);

    let raw_type = item
        .get("type")
        .or_else(|| item.get("kind"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    log::debug!("codex item {}: type={:?}", method, raw_type);

    let lower = raw_type.to_lowercase();
    if lower.contains("user") || lower.contains("assistant") || lower.contains("agent message") {
        return None;
    }

    let kind = classify_item_type(raw_type)?;
    let title = item_type_title(kind);

    let detail = extract_detail(item).or_else(|| {
        if method == "item/completed" {
            item.get("result").and_then(|r| extract_detail(r))
        } else {
            None
        }
    });

    Some(ActivityEvent {
        kind: kind.to_string(),
        title: title.to_string(),
        detail,
    })
}
