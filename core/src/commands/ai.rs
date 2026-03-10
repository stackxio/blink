use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ChatInput {
    pub prompt: String,
    pub system: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatOutput {
    pub text: String,
}

#[tauri::command]
pub async fn chat(input: ChatInput) -> Result<ChatOutput, String> {
    // TODO: wire up to AIRouter with active provider from settings
    let _ = input;
    Err("chat not yet implemented".to_string())
}
