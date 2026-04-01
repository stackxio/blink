pub mod anthropic;
pub mod api;
pub mod blink;
pub mod ollama;
pub mod openai;
pub mod traits;
pub mod types;

pub use traits::AIProvider;
pub use types::{AIError, ChatRequest, ChatResponse};
