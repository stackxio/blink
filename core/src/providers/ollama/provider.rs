use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

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

    /// List locally available models from the Ollama server.
    pub async fn list_models(endpoint: &str) -> Result<Vec<OllamaModelInfo>, String> {
        let url = format!("{}/api/tags", endpoint.trim_end_matches('/'));
        let client = Client::new();
        let resp = client
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("Cannot reach Ollama at {}: {}", url, e))?;

        if !resp.status().is_success() {
            return Err(format!("Ollama returned status {}", resp.status()));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

        let models = body["models"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .map(|m| OllamaModelInfo {
                name: m["name"].as_str().unwrap_or("").to_string(),
                size: m["size"].as_u64().unwrap_or(0),
                parameter_size: m["details"]["parameter_size"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
            })
            .collect();

        Ok(models)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct OllamaModelInfo {
    pub name: String,
    pub size: u64,
    pub parameter_size: String,
}

// --- Ollama-specific wire types (kept private to provider) ---

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

    async fn chat_stream(&self, req: ChatRequest, tx: mpsc::Sender<String>) -> Result<(), AIError> {
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

        let mut buffer = String::new();

        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?
        {
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if let Ok(stream_chunk) = serde_json::from_str::<OllamaStreamChunk>(&line) {
                    if !stream_chunk.message.content.is_empty() {
                        if tx.send(stream_chunk.message.content).await.is_err() {
                            return Ok(());
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
