use async_trait::async_trait;

use super::provider::AIProvider;
use super::types::{AIError, ChatRequest, ChatResponse};

pub struct OllamaProvider {
    pub endpoint: String,
    pub model: String,
}

impl OllamaProvider {
    pub fn new(endpoint: Option<String>, model: String) -> Self {
        Self {
            endpoint: endpoint.unwrap_or_else(|| "http://localhost:11434".to_string()),
            model,
        }
    }
}

#[async_trait]
impl AIProvider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    async fn chat(&self, _req: ChatRequest) -> Result<ChatResponse, AIError> {
        // TODO: implement Ollama API call via reqwest to self.endpoint
        todo!("Ollama chat not yet implemented")
    }
}
