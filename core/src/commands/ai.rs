use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

use crate::ai::codex::CodexProvider;
use crate::ai::custom::CustomProvider;
use crate::ai::ollama::OllamaProvider;
use crate::ai::router::AIRouter;
use crate::ai::types::ChatRequest;
use crate::settings::store::SettingsStore;

#[derive(Debug, Deserialize)]
pub struct ChatInput {
    pub prompt: String,
    pub system: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatOutput {
    pub text: String,
}

// --- Streaming event payloads ---

#[derive(Clone, Serialize)]
struct ChatStreamChunk {
    chunk: String,
}

#[derive(Clone, Serialize)]
struct ChatStreamDone {
    full_text: String,
    duration_ms: u64,
}

#[derive(Clone, Serialize)]
struct ChatStreamError {
    error: String,
}

// --- Streaming chat command ---

#[tauri::command]
pub async fn chat_stream(app_handle: tauri::AppHandle, input: ChatInput) -> Result<(), String> {
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;

    // Build the prompt: prepend system prompt if provided
    let prompt = if let Some(system) = &input.system {
        format!("{}\n\n{}", system, input.prompt)
    } else {
        input.prompt.clone()
    };

    // Determine the provider and spawn accordingly
    let provider = settings.active_provider.clone();

    if provider == "codex" {
        // Spawn codex exec as a child process with piped stdout/stderr
        let mut child = Command::new("/opt/homebrew/bin/codex")
            .arg("exec")
            .arg(&prompt)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn codex CLI: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture stdout".to_string())?;
        let stderr_handle = child.stderr.take();

        // Spawn a background task to read stdout and emit events
        tauri::async_runtime::spawn(async move {
            let start = Instant::now();
            let mut reader = tokio::io::BufReader::new(stdout);
            let mut full_text = String::new();
            let mut line = String::new();

            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        full_text.push_str(&line);
                        let _ = app_handle.emit(
                            "chat:stream",
                            ChatStreamChunk {
                                chunk: line.clone(),
                            },
                        );
                    }
                    Err(e) => {
                        let _ = app_handle.emit(
                            "chat:error",
                            ChatStreamError {
                                error: format!("Error reading stdout: {}", e),
                            },
                        );
                        return;
                    }
                }
            }

            // Wait for the process to finish
            match child.wait().await {
                Ok(status) if status.success() => {
                    let duration = start.elapsed();
                    let _ = app_handle.emit(
                        "chat:done",
                        ChatStreamDone {
                            full_text: full_text.trim().to_string(),
                            duration_ms: duration.as_millis() as u64,
                        },
                    );
                }
                Ok(status) => {
                    // Process exited with non-zero status — read stderr
                    let mut err_msg = format!("codex CLI exited with {}", status);
                    if let Some(mut stderr) = stderr_handle {
                        let mut buf = String::new();
                        let mut stderr_reader = tokio::io::BufReader::new(&mut stderr);
                        if let Ok(_) = tokio::io::AsyncReadExt::read_to_string(
                            &mut stderr_reader,
                            &mut buf,
                        )
                        .await
                        {
                            if !buf.is_empty() {
                                err_msg.push_str(": ");
                                err_msg.push_str(buf.trim());
                            }
                        }
                    }
                    let _ = app_handle.emit(
                        "chat:error",
                        ChatStreamError { error: err_msg },
                    );
                }
                Err(e) => {
                    let _ = app_handle.emit(
                        "chat:error",
                        ChatStreamError {
                            error: format!("Failed to wait for codex process: {}", e),
                        },
                    );
                }
            }
        });

        Ok(())
    } else {
        // For non-codex providers, fall back to the router (non-streaming) but still emit events
        tauri::async_runtime::spawn(async move {
            let start = Instant::now();

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
                prompt: input.prompt,
                system: input.system,
                context: vec![],
            };

            match router.chat(req).await {
                Ok(response) => {
                    let duration = start.elapsed();
                    // Emit the full text as a single chunk, then done
                    let _ = app_handle.emit(
                        "chat:stream",
                        ChatStreamChunk {
                            chunk: response.text.clone(),
                        },
                    );
                    let _ = app_handle.emit(
                        "chat:done",
                        ChatStreamDone {
                            full_text: response.text,
                            duration_ms: duration.as_millis() as u64,
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
        });

        Ok(())
    }
}

#[tauri::command]
pub async fn chat(input: ChatInput) -> Result<ChatOutput, String> {
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;

    let mut router = AIRouter::new(settings.active_provider.clone());

    // Always register codex provider — the CLI handles its own auth
    router.register(Box::new(CodexProvider::new(
        settings.codex.model.clone(),
    )));

    // Register ollama provider
    router.register(Box::new(OllamaProvider::new(
        Some(settings.ollama.endpoint.clone()),
        settings.ollama.model.clone(),
    )));

    // Register custom provider if configured
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
        prompt: input.prompt,
        system: input.system,
        context: vec![],
    };

    let response = router.chat(req).await.map_err(|e| e.to_string())?;

    Ok(ChatOutput {
        text: response.text,
    })
}
