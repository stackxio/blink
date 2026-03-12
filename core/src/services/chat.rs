//! Chat service — request building and router construction.
//!
//! Each provider has different context handling:
//! - Providers with their own context (e.g. Claude Code, Codex app-server)
//!   receive only the current message + system prompt separately.
//! - Stateless providers (e.g. Ollama, Custom API) receive the full
//!   conversation history baked into the prompt.

use rusqlite::Connection;

use crate::db::queries;
use crate::providers::api::ApiProvider;
use crate::providers::anthropic::ClaudeCodeProvider;
use crate::providers::ollama::OllamaProvider;
use crate::providers::openai::CodexProvider;
use crate::providers::types::ChatRequest;
use crate::services::router::AIRouter;
use crate::settings::config::CaretSettings;
use crate::settings::prompts;

/// Whether a provider manages conversation context internally.
/// These providers receive only the current user message and system prompt,
/// not the full conversation history.
pub fn provider_manages_context(provider: &str) -> bool {
    matches!(provider, "codex" | "claude_code")
}

/// Build a ChatRequest appropriate for the active provider.
///
/// For context-aware providers: raw prompt + system prompt separately.
/// For stateless providers: full history + system prompt baked into one string.
pub fn build_chat_request(
    provider: &str,
    conn: &Connection,
    thread_id: Option<&str>,
    current_prompt: &str,
    prompt_mode: &str,
) -> ChatRequest {
    if provider_manages_context(provider) {
        let system = prompts::load_system_prompt_with_mode(prompt_mode);
        ChatRequest {
            prompt: current_prompt.to_string(),
            system: Some(system),
            context: vec![],
        }
    } else {
        let full_prompt = build_full_prompt(conn, thread_id, current_prompt, prompt_mode);
        ChatRequest {
            prompt: full_prompt,
            system: None,
            context: vec![],
        }
    }
}

/// Build the full prompt with system instructions and conversation history.
/// Used by stateless providers that don't maintain their own context.
fn build_full_prompt(
    conn: &Connection,
    thread_id: Option<&str>,
    current_prompt: &str,
    prompt_mode: &str,
) -> String {
    let system_prompt = prompts::load_system_prompt_with_mode(prompt_mode);

    let mut history = String::new();
    if let Some(tid) = thread_id {
        if let Ok(messages) = queries::list_messages(conn, tid) {
            for msg in &messages {
                let role_label = if msg.role == "user" {
                    "User"
                } else {
                    "Assistant"
                };
                history.push_str(&format!("{}: {}\n\n", role_label, msg.content));
            }
        }
    }

    if history.is_empty() {
        format!("{}\n\n---\n\nUser: {}", system_prompt, current_prompt)
    } else {
        format!(
            "{}\n\n---\n\nConversation so far:\n\n{}User: {}",
            system_prompt, history, current_prompt
        )
    }
}

/// Construct an AIRouter with all configured providers registered.
pub fn build_router(settings: &CaretSettings) -> AIRouter {
    let mut router = AIRouter::new(settings.active_provider.clone());

    router.register(Box::new(CodexProvider::new(settings.codex.model.clone())));

    router.register(Box::new(OllamaProvider::new(
        Some(settings.ollama.endpoint.clone()),
        settings.ollama.model.clone(),
    )));

    if !settings.custom.endpoint.is_empty() {
        let api_key = if settings.custom.api_key.is_empty() {
            None
        } else {
            Some(settings.custom.api_key.clone())
        };
        router.register(Box::new(ApiProvider::new(
            settings.custom.endpoint.clone(),
            settings.custom.model.clone(),
            api_key,
        )));
    }

    let cc_model = if settings.claude_code.model.is_empty() {
        None
    } else {
        Some(settings.claude_code.model.clone())
    };
    router.register(Box::new(ClaudeCodeProvider::new(cc_model, None)));

    router
}
