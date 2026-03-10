use serde::{Deserialize, Serialize};

use crate::ai::codex::CodexProvider;
use crate::ai::custom::CustomProvider;
use crate::ai::ollama::OllamaProvider;
use crate::ai::router::AIRouter;
use crate::ai::types::ChatRequest;
use crate::settings::store::SettingsStore;

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
    let store = SettingsStore::new();
    let settings = store.load().map_err(|e| e.to_string())?;

    let mut router = AIRouter::new(settings.active_provider.clone());

    // Always register codex provider — the CLI handles its own auth
    router.register(Box::new(CodexProvider::new(
        settings.codex.model.clone(),
    )));

    // Register ollama provider
    router.register(Box::new(OllamaProvider::new(
        Some(settings.ollama.endpoint.clone()),
        settings.ollama.model.clone(),
    )));

    // Register custom provider if configured
    if !settings.custom.endpoint.is_empty() {
        let api_key = if settings.custom.api_key.is_empty() {
            None
        } else {
            Some(settings.custom.api_key.clone())
        };
        router.register(Box::new(CustomProvider::new(
            settings.custom.endpoint.clone(),
            settings.custom.model.clone(),
            api_key,
        )));
    }

    let req = ChatRequest {
        prompt: input.prompt,
        system: input.system,
        context: vec![],
    };

    let response = router.chat(req).await.map_err(|e| e.to_string())?;

    Ok(ChatOutput {
        text: response.text,
    })
}
