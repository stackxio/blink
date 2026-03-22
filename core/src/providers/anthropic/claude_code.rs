//! Claude Code CLI provider.
//!
//! Communicates with the `claude` CLI in print mode (`-p`) for non-interactive
//! programmatic access. Supports real-time token streaming via
//! `--output-format stream-json --verbose --include-partial-messages`.
//!
//! All Claude Code-specific wire types and parsing stay in this file.

use async_trait::async_trait;
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

pub struct ClaudeCodeProvider {
    pub model: String,
    pub binary: String,
}

impl ClaudeCodeProvider {
    pub fn new(model: Option<String>, binary: Option<String>) -> Self {
        Self {
            model: model.unwrap_or_else(|| "sonnet".to_string()),
            binary: binary.unwrap_or_else(|| "claude".to_string()),
        }
    }

    fn build_prompt(&self, req: &ChatRequest) -> String {
        let mut parts = Vec::new();

        for msg in &req.messages {
            parts.push(format!("{}: {}", msg.role, msg.content));
        }

        parts.push(req.prompt.clone());
        parts.join("\n\n")
    }

    fn base_args(&self) -> Vec<String> {
        let mut args = vec!["-p".to_string()];
        if !self.model.is_empty() {
            args.push("--model".to_string());
            args.push(self.model.clone());
        }
        args
    }
}

// --- Claude Code JSON wire types ---

#[derive(Deserialize, Debug)]
struct ClaudeJsonResult {
    result: Option<String>,
    #[serde(default)]
    is_error: bool,
}

#[derive(Deserialize, Debug)]
struct ClaudeStreamLine {
    #[serde(rename = "type")]
    event_type: Option<String>,
    /// Present when type == "assistant"
    message: Option<ClaudeMessage>,
    /// Present when type == "stream_event"
    event: Option<ClaudeStreamEvent>,
    /// Present when type == "result"
    result: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ClaudeMessage {
    content: Option<Vec<ClaudeContentBlock>>,
}

#[derive(Deserialize, Debug)]
struct ClaudeContentBlock {
    #[serde(rename = "type")]
    block_type: Option<String>,
    text: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ClaudeStreamEvent {
    delta: Option<ClaudeDelta>,
}

#[derive(Deserialize, Debug)]
struct ClaudeDelta {
    #[serde(rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
}

#[async_trait]
impl AIProvider for ClaudeCodeProvider {
    fn name(&self) -> &str {
        "claude_code"
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let prompt = self.build_prompt(&req);
        let mut args = self.base_args();
        args.push("--output-format".to_string());
        args.push("json".to_string());

        if let Some(system) = &req.system {
            if !system.is_empty() {
                args.push("--append-system-prompt".to_string());
                args.push(system.clone());
            }
        }

        args.push(prompt);

        let output = Command::new(&self.binary)
            .args(&args)
            .output()
            .await
            .map_err(|e| {
                AIError::ProviderError(format!("Failed to run claude CLI: {}", e))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AIError::ProviderError(format!(
                "claude CLI exited with {}: {}",
                output.status, stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        if let Ok(parsed) = serde_json::from_str::<ClaudeJsonResult>(&stdout) {
            if parsed.is_error {
                return Err(AIError::ProviderError(
                    parsed.result.unwrap_or_else(|| "Unknown error".to_string()),
                ));
            }
            return Ok(ChatResponse {
                text: parsed.result.unwrap_or_default(),
            });
        }

        Ok(ChatResponse {
            text: stdout.trim().to_string(),
        })
    }

    async fn chat_stream(
        &self,
        req: ChatRequest,
        tx: mpsc::Sender<String>,
    ) -> Result<(), AIError> {
        let prompt = self.build_prompt(&req);
        let mut args = self.base_args();
        args.push("--output-format".to_string());
        args.push("stream-json".to_string());
        args.push("--verbose".to_string());
        args.push("--include-partial-messages".to_string());

        if let Some(system) = &req.system {
            if !system.is_empty() {
                args.push("--append-system-prompt".to_string());
                args.push(system.clone());
            }
        }

        args.push(prompt);

        let mut child = Command::new(&self.binary)
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                AIError::ProviderError(format!("Failed to spawn claude CLI: {}", e))
            })?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AIError::ProviderError("Failed to capture claude stdout".to_string()))?;

        let mut reader = BufReader::new(stdout).lines();
        let mut got_deltas = false;

        while let Ok(Some(line)) = reader.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let parsed: ClaudeStreamLine = match serde_json::from_str(trimmed) {
                Ok(p) => p,
                Err(_) => continue,
            };

            let event_type = parsed.event_type.as_deref().unwrap_or("");

            match event_type {
                "stream_event" => {
                    if let Some(event) = &parsed.event {
                        if let Some(delta) = &event.delta {
                            if delta.delta_type.as_deref() == Some("text_delta") {
                                if let Some(text) = &delta.text {
                                    if !text.is_empty() {
                                        got_deltas = true;
                                        if tx.send(text.clone()).await.is_err() {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                // Skip "assistant" cumulative messages — they duplicate stream_event deltas
                "assistant" => {}
                "result" => {
                    // Fallback: if no stream_event deltas arrived, send the final result
                    if !got_deltas {
                        if let Some(result_text) = &parsed.result {
                            if !result_text.is_empty() {
                                let _ = tx.send(result_text.clone()).await;
                            }
                        }
                    }
                    break;
                }
                _ => {}
            }
        }

        let _ = child.wait().await;
        Ok(())
    }
}
