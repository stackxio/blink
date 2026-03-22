use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::db::queries;
use crate::providers::ollama::{OllamaModelInfo, OllamaProvider};
use crate::providers::openai::{ActivityEvent, CodexServer, CodexStreamEvent};
use crate::services::chat;
use crate::settings::prompts;
use crate::settings::store::SettingsStore;

// --- Types ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInput {
    pub prompt: String,
    pub thread_id: Option<String>,
    pub reasoning_effort: Option<String>,
    pub fast_mode: Option<bool>,
    /// "full-access" | "approval-required"
    pub runtime_mode: Option<String>,
    /// Override active_provider from settings
    pub provider: Option<String>,
    /// Override model from settings
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatOutput {
    pub text: String,
}

// --- Stream session tracking ---

pub struct StreamSession {
    pub cancelled: Arc<AtomicBool>,
    pub child_pid: Option<u32>,
    pub codex_thread_id: Option<String>,
    pub codex_turn_id: Option<String>,
}

pub type StreamSessions = Arc<Mutex<HashMap<String, StreamSession>>>;

pub fn create_stream_sessions() -> StreamSessions {
    Arc::new(Mutex::new(HashMap::new()))
}

// --- Codex app-server state (persistent JSON-RPC process) ---

pub type CodexState = Arc<tokio::sync::Mutex<Option<Arc<CodexServer>>>>;

pub fn create_codex_state() -> CodexState {
    Arc::new(tokio::sync::Mutex::new(None))
}

async fn get_codex_server(state: &CodexState) -> Result<Arc<CodexServer>, String> {
    let mut guard = state.lock().await;
    if let Some(server) = guard.as_ref() {
        return Ok(server.clone());
    }

    let server = CodexServer::spawn("/opt/homebrew/bin/codex")
        .await
        .map_err(|e| format!("Failed to start codex app-server: {}", e))?;

    server.ensure_initialized().await?;

    let server = Arc::new(server);
    *guard = Some(server.clone());
    Ok(server)
}

// --- Event payloads ---

#[derive(Clone, Serialize)]
struct ChatStreamChunk {
    chunk: String,
}

#[derive(Clone, Serialize)]
struct ChatStreamDone {
    full_text: String,
}

#[derive(Clone, Serialize)]
struct ChatStreamError {
    error: String,
}

#[derive(Clone, Serialize)]
struct ChatStreamCancelled {
    partial_text: String,
}

#[derive(Clone, Serialize)]
struct ChatStreamActivity {
    activity: ActivityEvent,
}

// --- Helpers ---

fn generate_session_id() -> String {
    format!(
        "{:032x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )
}

/// Codex uses a persistent JSON-RPC server process with its own thread/turn
/// management. This is the only provider that streams via a long-lived child
/// process rather than the generic AIRouter.
fn uses_persistent_server(provider: &str) -> bool {
    provider == "codex"
}

// --- Commands ---

#[tauri::command]
pub async fn chat_stream(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<Connection>>,
    sessions: tauri::State<'_, StreamSessions>,
    codex_state: tauri::State<'_, CodexState>,
    input: ChatInput,
) -> Result<String, String> {
    log::info!(
        "chat_stream: provider lookup, thread_id={:?}, prompt_len={}",
        input.thread_id,
        input.prompt.len()
    );

    let store = SettingsStore::new();
    let mut settings = store.load().map_err(|e| {
        log::error!("chat_stream: failed to load settings: {}", e);
        e.to_string()
    })?;

    // Use explicit provider/model from input if provided, otherwise fall back to settings
    let provider = input.provider.clone().unwrap_or_else(|| settings.active_provider.clone());
    if let Some(ref model) = input.model {
        match provider.as_str() {
            "codex" => settings.codex.model = model.clone(),
            "ollama" => settings.ollama.model = model.clone(),
            "claude_code" => settings.claude_code.model = model.clone(),
            "custom" => settings.custom.model = model.clone(),
            _ => {}
        }
        settings.active_provider = provider.clone();
    }
    log::info!("chat_stream: provider={}, model={}", provider,
        match provider.as_str() {
            "codex" => &settings.codex.model,
            "ollama" => &settings.ollama.model,
            "claude_code" => &settings.claude_code.model,
            "custom" => &settings.custom.model,
            _ => "unknown",
        }
    );

    let session_id = generate_session_id();
    let cancelled = Arc::new(AtomicBool::new(false));

    {
        let mut sess = sessions.lock().map_err(|e| {
            log::error!("chat_stream: failed to lock sessions: {}", e);
            e.to_string()
        })?;
        sess.insert(
            session_id.clone(),
            StreamSession {
                cancelled: cancelled.clone(),
                child_pid: None,
                codex_thread_id: None,
                codex_turn_id: None,
            },
        );
    }

    let session_id_clone = session_id.clone();
    let sessions_inner = sessions.inner().clone();

    if uses_persistent_server(&provider) {
        stream_via_codex_server(
            app_handle,
            state,
            sessions,
            codex_state,
            &settings,
            input,
            session_id.clone(),
            session_id_clone,
            sessions_inner,
            cancelled,
        )
        .await?;
    } else {
        stream_via_router(
            app_handle,
            state,
            &settings,
            &provider,
            input,
            session_id_clone,
            sessions_inner,
            cancelled,
        )?;
    }

    log::info!("chat_stream: session started session_id={}", session_id);
    Ok(session_id)
}

/// Stream via the generic AIRouter. Used by all providers except those with
/// persistent server processes.
fn stream_via_router(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<Connection>>,
    settings: &crate::settings::config::CaretSettings,
    provider: &str,
    input: ChatInput,
    session_id_clone: String,
    sessions_inner: StreamSessions,
    cancelled: Arc<AtomicBool>,
) -> Result<(), String> {
    let req = {
        let conn = state.lock().map_err(|e| {
            log::error!("chat_stream: failed to lock db: {}", e);
            e.to_string()
        })?;
        chat::build_chat_request(
            provider,
            &conn,
            input.thread_id.as_deref(),
            &input.prompt,
            &settings.prompt_mode,
        )
    };

    let settings = settings.clone();
    tauri::async_runtime::spawn(async move {
        let router = chat::build_router(&settings);

        if cancelled.load(Ordering::Relaxed) {
            let _ = app_handle.emit(
                "chat:cancelled",
                ChatStreamCancelled {
                    partial_text: String::new(),
                },
            );
            if let Ok(mut sess) = sessions_inner.lock() {
                sess.remove(&session_id_clone);
            }
            return;
        }

        let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(64);

        let cancelled_reader = cancelled.clone();
        let app_reader = app_handle.clone();
        let sessions_reader = sessions_inner.clone();
        let session_id_reader = session_id_clone.clone();

        let reader_handle = tauri::async_runtime::spawn(async move {
            let mut full_text = String::new();

            while let Some(chunk) = rx.recv().await {
                if cancelled_reader.load(Ordering::Relaxed) {
                    let _ = app_reader.emit(
                        "chat:cancelled",
                        ChatStreamCancelled {
                            partial_text: full_text.trim().to_string(),
                        },
                    );
                    if let Ok(mut sess) = sessions_reader.lock() {
                        sess.remove(&session_id_reader);
                    }
                    return full_text;
                }

                full_text.push_str(&chunk);
                let _ = app_reader.emit("chat:stream", ChatStreamChunk { chunk });
            }

            full_text
        });

        let stream_result = router.chat_stream(req, tx).await;
        let full_text = reader_handle.await.unwrap_or_default();

        if cancelled.load(Ordering::Relaxed) {
            // Already handled by reader
        } else {
            match stream_result {
                Ok(()) => {
                    let _ = app_handle.emit(
                        "chat:done",
                        ChatStreamDone {
                            full_text: full_text.trim().to_string(),
                        },
                    );
                }
                Err(e) => {
                    let _ = app_handle.emit(
                        "chat:error",
                        ChatStreamError {
                            error: e.to_string(),
                        },
                    );
                }
            }
        }

        if let Ok(mut sess) = sessions_inner.lock() {
            sess.remove(&session_id_clone);
        }
    });

    Ok(())
}

/// Stream via the Codex persistent JSON-RPC app-server process.
/// This is Codex-specific: it maintains threads, injects system prompts on first
/// turn, and reads streaming events from a long-lived child process.
#[allow(clippy::too_many_arguments)]
async fn stream_via_codex_server(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<Connection>>,
    sessions: tauri::State<'_, StreamSessions>,
    codex_state: tauri::State<'_, CodexState>,
    settings: &crate::settings::config::CaretSettings,
    input: ChatInput,
    session_id: String,
    session_id_clone: String,
    sessions_inner: StreamSessions,
    cancelled: Arc<AtomicBool>,
) -> Result<(), String> {
    let server = get_codex_server(&codex_state.inner()).await.map_err(|e| {
        log::error!("chat_stream: codex server failed: {}", e);
        e
    })?;

    let our_thread_id = input
        .thread_id
        .clone()
        .unwrap_or_else(|| "default".to_string());

    let stored_codex_id: Option<String> = {
        let conn = state.lock().map_err(|e| {
            log::error!("chat_stream: failed to lock db: {}", e);
            e.to_string()
        })?;
        queries::get_codex_thread_id(&conn, &our_thread_id).unwrap_or(None)
    };

    let (approval_policy, sandbox) = match input.runtime_mode.as_deref() {
        Some("approval-required") => ("always", "default"),
        _ => ("never", "danger-full-access"),
    };

    let (codex_thread_id, is_new_thread) = server
        .get_or_create_thread(
            &our_thread_id,
            stored_codex_id.as_deref(),
            approval_policy,
            sandbox,
        )
        .await
        .map_err(|e| {
            log::error!("chat_stream: get_or_create_thread failed: {}", e);
            e
        })?;

    if is_new_thread {
        if let Ok(conn) = state.lock() {
            if let Err(e) = queries::set_codex_thread_id(&conn, &our_thread_id, &codex_thread_id) {
                log::error!("chat_stream: set_codex_thread_id failed: {}", e);
            }
        }
    }

    if let Ok(mut sess) = sessions.lock() {
        if let Some(session) = sess.get_mut(&session_id) {
            session.codex_thread_id = Some(codex_thread_id.clone());
            session.child_pid = server.pid();
        }
    }

    let server_clone = server.clone();
    let codex_state_clone = codex_state.inner().clone();

    let system_prompt = if server.needs_system_prompt(&codex_thread_id).await {
        Some(prompts::load_system_prompt_with_mode(&settings.prompt_mode))
    } else {
        None
    };

    let codex_model = settings.codex.model.clone();

    tauri::async_runtime::spawn(async move {
        let mut full_text = String::new();

        // Inject system prompt on first turn
        if let Some(sys_prompt) = &system_prompt {
            match server
                .send_turn(
                    &codex_thread_id,
                    &format!(
                        "[SYSTEM INSTRUCTIONS — follow these for all responses]\n\n{}",
                        sys_prompt
                    ),
                    None,
                    None,
                    None,
                )
                .await
            {
                Ok((_sys_turn_id, mut sys_rx)) => {
                    loop {
                        match tokio::time::timeout(
                            std::time::Duration::from_secs(60),
                            sys_rx.recv(),
                        )
                        .await
                        {
                            Ok(Some(CodexStreamEvent::TurnCompleted)) => break,
                            Ok(Some(CodexStreamEvent::Error(_))) => break,
                            Ok(None) => break,
                            Ok(Some(
                                CodexStreamEvent::Delta(_) | CodexStreamEvent::Activity(_),
                            )) => continue,
                            Err(_) => break,
                        }
                    }
                    server.mark_prompted(&codex_thread_id).await;
                }
                Err(e) => {
                    log::warn!("Failed to inject system prompt: {}", e);
                }
            }
        }

        let model_ref = if codex_model.is_empty() { None } else { Some(codex_model.as_str()) };
        let (turn_id, mut event_rx) = match server
            .send_turn(
                &codex_thread_id,
                &input.prompt,
                input.reasoning_effort.as_deref(),
                input.fast_mode,
                model_ref,
            )
            .await
        {
            Ok(result) => result,
            Err(e) => {
                let _ = app_handle.emit(
                    "chat:error",
                    ChatStreamError {
                        error: format!("Turn start failed: {}", e),
                    },
                );
                if let Ok(mut sess) = sessions_inner.lock() {
                    sess.remove(&session_id_clone);
                }
                if e.contains("Broken pipe") || e.contains("Failed to write") {
                    let mut guard = codex_state_clone.lock().await;
                    *guard = None;
                }
                return;
            }
        };

        if let Ok(mut sess) = sessions_inner.lock() {
            if let Some(session) = sess.get_mut(&session_id_clone) {
                session.codex_turn_id = Some(turn_id.clone());
            }
        }

        loop {
            if cancelled.load(Ordering::Relaxed) {
                let _ = server.turn_interrupt(&codex_thread_id, &turn_id).await;
                let _ = app_handle.emit(
                    "chat:cancelled",
                    ChatStreamCancelled {
                        partial_text: full_text.trim().to_string(),
                    },
                );
                break;
            }

            match tokio::time::timeout(std::time::Duration::from_millis(100), event_rx.recv())
                .await
            {
                Ok(Some(CodexStreamEvent::Delta(delta))) => {
                    full_text.push_str(&delta);
                    let _ = app_handle.emit("chat:stream", ChatStreamChunk { chunk: delta });
                }
                Ok(Some(CodexStreamEvent::Activity(activity))) => {
                    let _ = app_handle.emit("chat:activity", ChatStreamActivity { activity });
                }
                Ok(Some(CodexStreamEvent::TurnCompleted)) => {
                    let _ = app_handle.emit(
                        "chat:done",
                        ChatStreamDone {
                            full_text: full_text.trim().to_string(),
                        },
                    );
                    break;
                }
                Ok(Some(CodexStreamEvent::Error(e))) => {
                    let _ = app_handle.emit("chat:error", ChatStreamError { error: e });
                    break;
                }
                Ok(None) => {
                    if !full_text.is_empty() {
                        let _ = app_handle.emit(
                            "chat:done",
                            ChatStreamDone {
                                full_text: full_text.trim().to_string(),
                            },
                        );
                    } else {
                        let _ = app_handle.emit(
                            "chat:error",
                            ChatStreamError {
                                error: "Connection lost".to_string(),
                            },
                        );
                    }
                    break;
                }
                Err(_) => continue,
            }
        }

        server_clone.remove_subscriber(&codex_thread_id).await;
        if let Ok(mut sess) = sessions_inner.lock() {
            sess.remove(&session_id_clone);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_stream(
    sessions: tauri::State<'_, StreamSessions>,
    codex_state: tauri::State<'_, CodexState>,
    session_id: String,
) -> Result<(), String> {
    let (child_pid, codex_thread_id, codex_turn_id) = {
        let sess = sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sess.get(&session_id) {
            session.cancelled.store(true, Ordering::Relaxed);
            (
                session.child_pid,
                session.codex_thread_id.clone(),
                session.codex_turn_id.clone(),
            )
        } else {
            return Err("No active stream session found".to_string());
        }
    };

    if let (Some(thread_id), Some(turn_id)) = (&codex_thread_id, &codex_turn_id) {
        let thread_id = thread_id.clone();
        let turn_id = turn_id.clone();
        let codex_state = codex_state.inner().clone();
        tokio::spawn(async move {
            if let Ok(server) = get_codex_server(&codex_state).await {
                let _ = server.turn_interrupt(&thread_id, &turn_id).await;
            }
        });
    }

    if let Some(pid) = child_pid {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        let mut guard = codex_state.inner().lock().await;
        *guard = None;
    }

    Ok(())
}

#[tauri::command]
pub async fn chat(
    state: tauri::State<'_, Mutex<Connection>>,
    input: ChatInput,
) -> Result<ChatOutput, String> {
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;

    let req = {
        let conn = state.lock().map_err(|e| e.to_string())?;
        chat::build_chat_request(
            &settings.active_provider,
            &conn,
            input.thread_id.as_deref(),
            &input.prompt,
            &settings.prompt_mode,
        )
    };

    let router = chat::build_router(&settings);
    let response = router.chat(req).await.map_err(|e| e.to_string())?;

    Ok(ChatOutput {
        text: response.text,
    })
}

// --- Ollama model listing ---

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<OllamaModelInfo>, String> {
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;
    OllamaProvider::list_models(&settings.ollama.endpoint).await
}
