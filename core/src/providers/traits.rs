use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::providers::types::{AIError, ChatRequest, ChatResponse};

#[async_trait]
pub trait AIProvider: Send + Sync {
    fn name(&self) -> &str;
    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError>;
    async fn chat_stream(&self, req: ChatRequest, tx: mpsc::Sender<String>) -> Result<(), AIError>;
}
