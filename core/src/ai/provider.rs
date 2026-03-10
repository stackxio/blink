use async_trait::async_trait;

use super::types::{AIError, ChatRequest, ChatResponse};

#[async_trait]
pub trait AIProvider: Send + Sync {
    fn name(&self) -> &str;
    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError>;
}
