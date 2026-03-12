use std::collections::HashMap;

use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

pub struct AIRouter {
    providers: HashMap<String, Box<dyn AIProvider>>,
    active_provider: String,
}

impl AIRouter {
    pub fn new(active_provider: String) -> Self {
        Self {
            providers: HashMap::new(),
            active_provider,
        }
    }

    pub fn register(&mut self, provider: Box<dyn AIProvider>) {
        let name = provider.name().to_string();
        self.providers.insert(name, provider);
    }

    pub fn set_active(&mut self, name: String) {
        self.active_provider = name;
    }

    pub async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let provider = self.providers.get(&self.active_provider).ok_or_else(|| {
            AIError::ConfigError(format!("Provider '{}' not found", self.active_provider))
        })?;
        provider.chat(req).await
    }

    pub async fn chat_stream(
        &self,
        req: ChatRequest,
        tx: mpsc::Sender<String>,
    ) -> Result<(), AIError> {
        let provider = self.providers.get(&self.active_provider).ok_or_else(|| {
            AIError::ConfigError(format!("Provider '{}' not found", self.active_provider))
        })?;
        provider.chat_stream(req, tx).await
    }
}
