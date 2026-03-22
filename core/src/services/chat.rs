//! Chat service — request building and router construction.

use rusqlite::Connection;

use crate::db::queries;
use crate::providers::api::ApiProvider;
use crate::providers::anthropic::ClaudeCodeProvider;
use crate::providers::ollama::OllamaProvider;
use crate::providers::openai::CodexProvider;
use crate::providers::types::{ChatMessage, ChatRequest};
use crate::services::router::AIRouter;
use crate::settings::config::CaretSettings;
use crate::settings::prompts;

/// Whether a provider manages conversation context internally.
pub fn provider_manages_context(provider: &str) -> bool {
    matches!(provider, "codex" | "claude_code")
}

/// Load project memory block for a thread.
fn project_memory_block(conn: &Connection, thread_id: Option<&str>) -> String {
    let Some(tid) = thread_id else { return String::new() };
    let thread = match queries::get_thread(conn, tid) {
        Ok(Some(t)) => t,
        _ => return String::new(),
    };
    let project_id = match &thread.folder_id {
        Some(id) => id,
        None => return String::new(),
    };
    let memories = match queries::list_by_project(conn, project_id) {
        Ok(m) => m,
        Err(_) => return String::new(),
    };
    if memories.is_empty() { return String::new(); }
    let mut block = String::from("\n\n--- Project context ---\n");
    for m in &memories {
        block.push_str(&m.content);
        block.push('\n');
    }
    block.push_str("---\n");
    block
}

/// Load attachment summaries for a thread.
fn attachment_summaries_block(conn: &Connection, thread_id: Option<&str>) -> String {
    let Some(tid) = thread_id else { return String::new() };
    let attachments = match queries::list_attachments_by_thread(conn, tid) {
        Ok(a) => a,
        Err(_) => return String::new(),
    };
    if attachments.is_empty() { return String::new(); }
    let mut block = String::from("\n\n--- Attached files ---\n");
    for a in &attachments {
        block.push_str(&format!("[{}] ", a.original_name));
        if let Some(ref preview) = a.preview_text {
            let snippet: String = preview.chars().take(1500).collect();
            block.push_str(&snippet);
            if preview.len() > 1500 { block.push_str("..."); }
        } else {
            block.push_str("(not available)");
        }
        block.push('\n');
    }
    block.push_str("---\n");
    block
}

/// Load conversation history as structured messages.
fn load_history(conn: &Connection, thread_id: Option<&str>) -> Vec<ChatMessage> {
    let Some(tid) = thread_id else { return vec![] };
    let messages = match queries::list_messages(conn, tid) {
        Ok(m) => m,
        Err(_) => return vec![],
    };
    // Skip the last message if it's the current user message (already saved before this call)
    let prior = if messages.last().map(|m| m.role.as_str()) == Some("user") {
        &messages[..messages.len().saturating_sub(1)]
    } else {
        &messages[..]
    };
    prior
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect()
}

/// Build a ChatRequest with proper structured messages for all providers.
pub fn build_chat_request(
    provider: &str,
    conn: &Connection,
    thread_id: Option<&str>,
    current_prompt: &str,
    prompt_mode: &str,
) -> ChatRequest {
    let project_block = project_memory_block(conn, thread_id);
    let attachment_block = attachment_summaries_block(conn, thread_id);
    let extra_blocks = format!("{}{}", project_block, attachment_block);

    let mut system = prompts::load_system_prompt_with_mode(prompt_mode);
    if !extra_blocks.is_empty() {
        system.push_str(&extra_blocks);
    }

    if provider_manages_context(provider) {
        // Context-aware providers: just the current message + system prompt
        ChatRequest {
            prompt: current_prompt.to_string(),
            system: Some(system),
            messages: vec![],
        }
    } else {
        // Stateless providers: include full history as structured messages
        let history = load_history(conn, thread_id);
        ChatRequest {
            prompt: current_prompt.to_string(),
            system: Some(system),
            messages: history,
        }
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
