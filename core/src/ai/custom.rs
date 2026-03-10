use async_trait::async_trait;

use super::provider::AIProvider;
use super::types::{AIError, ChatRequest, ChatResponse};

pub struct CustomProvider {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
}

impl CustomProvider {
    pub fn new(endpoint: String, model: String, api_key: Option<String>) -> Self {
        Self {
            endpoint,
            model,
            api_key,
        }
    }
}

#[async_trait]
impl AIProvider for CustomProvider {
    fn name(&self) -> &str {
        "custom"
    }

    async fn chat(&self, _req: ChatRequest) -> Result<ChatResponse, AIError> {
        // TODO: implement custom endpoint API call via reqwest
        todo!("Custom provider chat not yet implemented")
    }
}
