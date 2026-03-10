use async_trait::async_trait;

use super::provider::AIProvider;
use super::types::{AIError, ChatRequest, ChatResponse};

pub struct CodexProvider {
    pub api_key: String,
    pub model: String,
}

impl CodexProvider {
    pub fn new(api_key: String, model: String) -> Self {
        Self { api_key, model }
    }
}

#[async_trait]
impl AIProvider for CodexProvider {
    fn name(&self) -> &str {
        "codex"
    }

    async fn chat(&self, _req: ChatRequest) -> Result<ChatResponse, AIError> {
        // TODO: implement Codex API call
        todo!("Codex chat not yet implemented")
    }
}
