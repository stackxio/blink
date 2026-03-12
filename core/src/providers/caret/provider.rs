use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

pub struct CaretProvider;

impl CaretProvider {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AIProvider for CaretProvider {
    fn name(&self) -> &str {
        "caret"
    }

    async fn chat(&self, _req: ChatRequest) -> Result<ChatResponse, AIError> {
        Err(AIError::ConfigError("Caret provider not yet implemented".into()))
    }

    async fn chat_stream(&self, _req: ChatRequest, _tx: mpsc::Sender<String>) -> Result<(), AIError> {
        Err(AIError::ConfigError("Caret provider not yet implemented".into()))
    }
}
