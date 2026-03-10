use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

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

#[async_trait]
impl AIProvider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
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

        let body = OllamaRequest {
            model: self.model.clone(),
            messages,
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
}
