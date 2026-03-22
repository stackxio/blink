//! Generic OpenAI-compatible API provider.
//! Works with any service exposing /v1/chat/completions (OpenAI, Anthropic via proxy, etc.).
//! Provider name kept as "custom" for backward compatibility with existing settings.

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

pub struct ApiProvider {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
    client: Client,
}

impl ApiProvider {
    pub fn new(endpoint: String, model: String, api_key: Option<String>) -> Self {
        Self {
            endpoint,
            model,
            api_key,
            client: Client::new(),
        }
    }

    fn build_messages(&self, req: &ChatRequest) -> Vec<OpenAIMessage> {
        let mut messages = Vec::new();

        if let Some(system) = &req.system {
            messages.push(OpenAIMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }

        // Conversation history
        for msg in &req.messages {
            messages.push(OpenAIMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        // Current user message
        messages.push(OpenAIMessage {
            role: "user".to_string(),
            content: req.prompt.clone(),
        });

        messages
    }

    fn build_request(&self, url: &str, body: &impl Serialize) -> reqwest::RequestBuilder {
        let mut request = self.client.post(url).json(body);

        if let Some(key) = &self.api_key {
            if !key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", key));
            }
        }

        request
    }
}

// --- OpenAI-compatible wire types (kept private to provider) ---

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessageResponse,
}

#[derive(Deserialize)]
struct OpenAIMessageResponse {
    content: String,
}

#[derive(Deserialize)]
struct OpenAIStreamChunk {
    choices: Vec<OpenAIStreamChoice>,
}

#[derive(Deserialize)]
struct OpenAIStreamChoice {
    delta: OpenAIDelta,
}

#[derive(Deserialize)]
struct OpenAIDelta {
    content: Option<String>,
}

#[async_trait]
impl AIProvider for ApiProvider {
    fn name(&self) -> &str {
        "custom"
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let body = OpenAIRequest {
            model: self.model.clone(),
            messages: self.build_messages(&req),
            stream: None,
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.endpoint.trim_end_matches('/')
        );

        let resp = self
            .build_request(&url, &body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AIError::ProviderError(format!(
                "API error {}: {}",
                status, text
            )));
        }

        let data: OpenAIResponse = resp
            .json()
            .await
            .map_err(|e| AIError::ParseError(e.to_string()))?;

        let text = data
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        Ok(ChatResponse { text })
    }

    async fn chat_stream(&self, req: ChatRequest, tx: mpsc::Sender<String>) -> Result<(), AIError> {
        let body = OpenAIRequest {
            model: self.model.clone(),
            messages: self.build_messages(&req),
            stream: Some(true),
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.endpoint.trim_end_matches('/')
        );

        let mut resp = self
            .build_request(&url, &body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AIError::ProviderError(format!(
                "API error {}: {}",
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

                if line == "data: [DONE]" {
                    return Ok(());
                }

                if let Some(json_str) = line.strip_prefix("data: ") {
                    if let Ok(stream_chunk) = serde_json::from_str::<OpenAIStreamChunk>(json_str) {
                        if let Some(choice) = stream_chunk.choices.first() {
                            if let Some(content) = &choice.delta.content {
                                if !content.is_empty() {
                                    if tx.send(content.clone()).await.is_err() {
                                        return Ok(());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
