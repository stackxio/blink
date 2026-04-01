use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub prompt: String,
    pub system: Option<String>,
    pub messages: Vec<ChatMessage>, // full conversation history
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingRequest {
    pub input: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingResponse {
    pub vectors: Vec<Vec<f32>>,
}

#[derive(Debug)]
pub enum AIError {
    NetworkError(String),
    ParseError(String),
    ProviderError(String),
    ConfigError(String),
}

impl fmt::Display for AIError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AIError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            AIError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            AIError::ProviderError(msg) => write!(f, "Provider error: {}", msg),
            AIError::ConfigError(msg) => write!(f, "Config error: {}", msg),
        }
    }
}

impl std::error::Error for AIError {}
