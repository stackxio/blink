use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

pub struct AnthropicProvider {
    pub api_key: String,
    pub model: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self { api_key, model }
    }
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }

    async fn chat(&self, _req: ChatRequest) -> Result<ChatResponse, AIError> {
        Err(AIError::ConfigError("Anthropic provider not yet implemented".into()))
    }

    async fn chat_stream(&self, _req: ChatRequest, _tx: mpsc::Sender<String>) -> Result<(), AIError> {
        Err(AIError::ConfigError("Anthropic provider not yet implemented".into()))
    }
}
