use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

pub struct BlinkProvider;

impl BlinkProvider {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AIProvider for BlinkProvider {
    fn name(&self) -> &str {
        "blink"
    }

    async fn chat(&self, _req: ChatRequest) -> Result<ChatResponse, AIError> {
        Err(AIError::ConfigError(
            "Blink provider not yet implemented".into(),
        ))
    }

    async fn chat_stream(
        &self,
        _req: ChatRequest,
        _tx: mpsc::Sender<String>,
    ) -> Result<(), AIError> {
        Err(AIError::ConfigError(
            "Blink provider not yet implemented".into(),
        ))
    }
}
