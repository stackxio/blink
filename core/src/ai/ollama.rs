use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use super::provider::AIProvider;
use super::types::{AIError, ChatRequest, ChatResponse};

pub struct OllamaProvider {
    pub endpoint: String,
    pub model: String,
    client: Client,
}

impl OllamaProvider {
    pub fn new(endpoint: Option<String>, model: String) -> Self {
        Self {
            endpoint: endpoint.unwrap_or_else(|| "http://localhost:11434".to_string()),
            model,
            client: Client::new(),
        }
    }

    fn build_messages(&self, req: &ChatRequest) -> Vec<OllamaMessage> {
        let mut messages = Vec::new();

        if let Some(system) = &req.system {
            messages.push(OllamaMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }

        for ctx in &req.context {
            messages.push(OllamaMessage {
                role: "user".to_string(),
                content: ctx.clone(),
            });
        }

        messages.push(OllamaMessage {
            role: "user".to_string(),
            content: req.prompt.clone(),
        });

        messages
    }
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
}

#[derive(Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OllamaResponse {
    message: OllamaResponseMessage,
}

#[derive(Deserialize)]
struct OllamaResponseMessage {
    content: String,
}

/// Streaming response line: {"message":{"content":"chunk"},"done":false}
#[derive(Deserialize)]
struct OllamaStreamChunk {
    message: OllamaStreamMessage,
    done: bool,
}

#[derive(Deserialize)]
struct OllamaStreamMessage {
    content: String,
}

#[async_trait]
impl AIProvider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let body = OllamaRequest {
            model: self.model.clone(),
            messages: self.build_messages(&req),
            stream: false,
        };

        let url = format!("{}/api/chat", self.endpoint.trim_end_matches('/'));

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AIError::ProviderError(format!(
                "Ollama API error {}: {}",
                status, text
            )));
        }

        let data: OllamaResponse = resp
            .json()
            .await
            .map_err(|e| AIError::ParseError(e.to_string()))?;

        Ok(ChatResponse {
            text: data.message.content,
        })
    }

    async fn chat_stream(
        &self,
        req: ChatRequest,
        tx: mpsc::Sender<String>,
    ) -> Result<(), AIError> {
        let body = OllamaRequest {
            model: self.model.clone(),
            messages: self.build_messages(&req),
            stream: true,
        };

        let url = format!("{}/api/chat", self.endpoint.trim_end_matches('/'));

        let mut resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AIError::ProviderError(format!(
                "Ollama API error {}: {}",
                status, text
            )));
        }

        // Ollama streams JSONL — one JSON object per line
        // Use chunk() to read raw bytes and split by newlines
        let mut buffer = String::new();

        while let Some(chunk) = resp.chunk().await.map_err(|e| AIError::NetworkError(e.to_string()))? {
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete lines
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if let Ok(stream_chunk) = serde_json::from_str::<OllamaStreamChunk>(&line) {
                    if !stream_chunk.message.content.is_empty() {
                        if tx.send(stream_chunk.message.content).await.is_err() {
                            return Ok(()); // receiver dropped
                        }
                    }
                    if stream_chunk.done {
                        return Ok(());
                    }
                }
            }
        }

        Ok(())
    }
}
