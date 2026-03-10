use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::ai::codex_server::{CodexServer, CodexStreamEvent};
use crate::ai::custom::CustomProvider;
use crate::ai::ollama::OllamaProvider;
use crate::ai::router::AIRouter;
use crate::ai::types::ChatRequest;
use crate::db::queries;
use crate::settings::prompts;
use crate::settings::store::SettingsStore;

// --- Types ---

#[derive(Debug, Deserialize)]
pub struct ChatInput {
    pub prompt: String,
    pub thread_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatOutput {
    pub text: String,
}

// --- Stream session tracking ---

pub struct StreamSession {
    pub cancelled: Arc<AtomicBool>,
    pub child_pid: Option<u32>,
}

pub type StreamSessions = Arc<Mutex<HashMap<String, StreamSession>>>;

pub fn create_stream_sessions() -> StreamSessions {
    Arc::new(Mutex::new(HashMap::new()))
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


/// Build the full prompt including system instructions and conversation history.
fn build_full_prompt(
    conn: &Connection,
    thread_id: Option<&str>,
    current_prompt: &str,
) -> String {
    let system_prompt = prompts::load_system_prompt();

    let mut history = String::new();
    if let Some(tid) = thread_id {
        if let Ok(messages) = queries::list_messages(conn, tid) {
            for msg in &messages {
                let role_label = if msg.role == "user" { "User" } else { "Assistant" };
                history.push_str(&format!("{}: {}\n\n", role_label, msg.content));
            }
        }
    }

    if history.is_empty() {
        format!("{}\n\n---\n\nUser: {}", system_prompt, current_prompt)
    } else {
        format!(
            "{}\n\n---\n\nConversation so far:\n\n{}User: {}",
            system_prompt, history, current_prompt
        )
    }
}

// --- Commands ---

#[tauri::command]
pub async fn chat_stream(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<Connection>>,
    sessions: tauri::State<'_, StreamSessions>,
    input: ChatInput,
) -> Result<String, String> {
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;

    let prompt = {
        let conn = state.lock().map_err(|e| e.to_string())?;
        build_full_prompt(&conn, input.thread_id.as_deref(), &input.prompt)
    };

    let provider = settings.active_provider.clone();

    // Create a session with cancellation token
    let session_id = format!(
        "{:032x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let cancelled = Arc::new(AtomicBool::new(false));

    {
        let mut sess = sessions.lock().map_err(|e| e.to_string())?;
        sess.insert(
            session_id.clone(),
            StreamSession {
                cancelled: cancelled.clone(),
                child_pid: None,
            },
        );
    }

    let session_id_clone = session_id.clone();
    let sessions_inner = sessions.inner().clone();

    if provider == "codex" {
        // Spawn codex app-server for real token-by-token streaming
        let (server, mut event_rx) = CodexServer::spawn("/opt/homebrew/bin/codex", None)
            .await
            .map_err(|e| format!("Failed to start codex app-server: {}", e))?;

        // Store PID for cancellation
        if let Some(pid) = server.pid() {
            if let Ok(mut sess) = sessions.lock() {
                if let Some(session) = sess.get_mut(&session_id) {
                    session.child_pid = Some(pid);
                }
            }
        }

        let server = Arc::new(server);

        tauri::async_runtime::spawn(async move {
            let mut full_text = String::new();

            // 1. Initialize handshake
            if let Err(e) = server.initialize().await {
                let _ = app_handle.emit(
                    "chat:error",
                    ChatStreamError {
                        error: format!("Codex initialize failed: {}", e),
                    },
                );
                if let Ok(mut sess) = sessions_inner.lock() {
                    sess.remove(&session_id_clone);
                }
                return;
            }

            // 2. Start a thread
            let thread_id = match server.thread_start().await {
                Ok(tid) => tid,
                Err(e) => {
                    let _ = app_handle.emit(
                        "chat:error",
                        ChatStreamError {
                            error: format!("Codex thread/start failed: {}", e),
                        },
                    );
                    if let Ok(mut sess) = sessions_inner.lock() {
                        sess.remove(&session_id_clone);
                    }
                    return;
                }
            };

            // 3. Start a turn with the user's prompt
            let turn_id = match server.turn_start(&thread_id, &prompt).await {
                Ok(tid) => tid,
                Err(e) => {
                    let _ = app_handle.emit(
                        "chat:error",
                        ChatStreamError {
                            error: format!("Codex turn/start failed: {}", e),
                        },
                    );
                    if let Ok(mut sess) = sessions_inner.lock() {
                        sess.remove(&session_id_clone);
                    }
                    return;
                }
            };

            // 4. Read streaming events
            loop {
                // Check cancellation
                if cancelled.load(Ordering::Relaxed) {
                    // Try to interrupt the turn
                    let _ = server.turn_interrupt(&thread_id, &turn_id).await;
                    let _ = app_handle.emit(
                        "chat:cancelled",
                        ChatStreamCancelled {
                            partial_text: full_text.trim().to_string(),
                        },
                    );
                    break;
                }

                match tokio::time::timeout(
                    std::time::Duration::from_millis(100),
                    event_rx.recv(),
                )
                .await
                {
                    Ok(Some(CodexStreamEvent::Delta(delta))) => {
                        full_text.push_str(&delta);
                        let _ = app_handle.emit(
                            "chat:stream",
                            ChatStreamChunk { chunk: delta },
                        );
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
                        let _ = app_handle.emit(
                            "chat:error",
                            ChatStreamError { error: e },
                        );
                        break;
                    }
                    Ok(None) => {
                        // Channel closed — process exited
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
                                    error: "Codex process exited unexpectedly".to_string(),
                                },
                            );
                        }
                        break;
                    }
                    Err(_) => {
                        // Timeout — loop back to check cancellation
                        continue;
                    }
                }
            }

            // Cleanup session
            if let Ok(mut sess) = sessions_inner.lock() {
                sess.remove(&session_id_clone);
            }
        });

        Ok(session_id)
    } else {
        // Non-codex providers — real streaming via mpsc channel
        tauri::async_runtime::spawn(async move {
            let mut router = AIRouter::new(provider);
            router.register(Box::new(OllamaProvider::new(
                Some(settings.ollama.endpoint.clone()),
                settings.ollama.model.clone(),
            )));
            if !settings.custom.endpoint.is_empty() {
                let api_key = if settings.custom.api_key.is_empty() {
                    None
                } else {
                    Some(settings.custom.api_key.clone())
                };
                router.register(Box::new(CustomProvider::new(
                    settings.custom.endpoint.clone(),
                    settings.custom.model.clone(),
                    api_key,
                )));
            }

            let req = ChatRequest {
                prompt,
                system: None,
                context: vec![],
            };

            // Check cancellation before sending
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

            // Spawn reader task that emits chunks as they arrive
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
                    let _ = app_reader.emit(
                        "chat:stream",
                        ChatStreamChunk {
                            chunk,
                        },
                    );
                }

                full_text
            });

            // Run the streaming request
            let stream_result = router.chat_stream(req, tx).await;

            // Wait for reader to finish and get the full text
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

        Ok(session_id)
    }
}

#[tauri::command]
pub async fn cancel_stream(
    sessions: tauri::State<'_, StreamSessions>,
    session_id: String,
) -> Result<(), String> {
    let sess = sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sess.get(&session_id) {
        // Signal cancellation
        session.cancelled.store(true, Ordering::Relaxed);

        // Also kill the child process directly for immediate effect
        if let Some(pid) = session.child_pid {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
        }

        Ok(())
    } else {
        Err("No active stream session found".to_string())
    }
}

#[tauri::command]
pub async fn chat(
    state: tauri::State<'_, Mutex<Connection>>,
    input: ChatInput,
) -> Result<ChatOutput, String> {
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;

    let prompt = {
        let conn = state.lock().map_err(|e| e.to_string())?;
        build_full_prompt(&conn, input.thread_id.as_deref(), &input.prompt)
    };

    let mut router = AIRouter::new(settings.active_provider.clone());

    router.register(Box::new(OllamaProvider::new(
        Some(settings.ollama.endpoint.clone()),
        settings.ollama.model.clone(),
    )));

    if !settings.custom.endpoint.is_empty() {
        let api_key = if settings.custom.api_key.is_empty() {
            None
        } else {
            Some(settings.custom.api_key.clone())
        };
        router.register(Box::new(CustomProvider::new(
            settings.custom.endpoint.clone(),
            settings.custom.model.clone(),
            api_key,
        )));
    }

    let req = ChatRequest {
        prompt,
        system: None,
        context: vec![],
    };

    let response = router.chat(req).await.map_err(|e| e.to_string())?;

    Ok(ChatOutput {
        text: response.text,
    })
}
