use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::provider::AIProvider;
use super::types::{AIError, ChatRequest, ChatResponse};

pub struct CustomProvider {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
    client: Client,
}

impl CustomProvider {
    pub fn new(endpoint: String, model: String, api_key: Option<String>) -> Self {
        Self {
            endpoint,
            model,
            api_key,
            client: Client::new(),
        }
    }
}

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
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

#[async_trait]
impl AIProvider for CustomProvider {
    fn name(&self) -> &str {
        "custom"
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let mut messages = Vec::new();

        if let Some(system) = &req.system {
            messages.push(OpenAIMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }

        for ctx in &req.context {
            messages.push(OpenAIMessage {
                role: "user".to_string(),
                content: ctx.clone(),
            });
        }

        messages.push(OpenAIMessage {
            role: "user".to_string(),
            content: req.prompt.clone(),
        });

        let body = OpenAIRequest {
            model: self.model.clone(),
            messages,
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.endpoint.trim_end_matches('/')
        );

        let mut request = self.client.post(&url).json(&body);

        if let Some(key) = &self.api_key {
            if !key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", key));
            }
        }

        let resp = request
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AIError::ProviderError(format!(
                "Custom API error {}: {}",
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
}
