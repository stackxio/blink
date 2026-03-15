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

/// Load project memory block for a thread (from its project/folder). Returns empty string if none.
fn project_memory_block(conn: &Connection, thread_id: Option<&str>) -> String {
    let Some(tid) = thread_id else {
        return String::new();
    };
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
    if memories.is_empty() {
        return String::new();
    }
    let mut block = String::from("\n\n--- Project context (shared across chats in this project) ---\n");
    for m in &memories {
        block.push_str(&m.content);
        block.push_str("\n");
    }
    block.push_str("---\n");
    block
}

/// Load attachment summaries for a thread (files attached to this chat). Returns empty string if none.
fn attachment_summaries_block(conn: &Connection, thread_id: Option<&str>) -> String {
    let Some(tid) = thread_id else {
        return String::new();
    };
    let attachments = match queries::list_attachments_by_thread(conn, tid) {
        Ok(a) => a,
        Err(_) => return String::new(),
    };
    if attachments.is_empty() {
        return String::new();
    }
    let mut block = String::from("\n\n--- Attached files (preview) ---\n");
    for a in &attachments {
        block.push_str(&format!("[{}] ", a.original_name));
        if let Some(ref preview) = a.preview_text {
            let snippet: String = preview.chars().take(1500).collect();
            block.push_str(&snippet);
            if preview.len() > 1500 {
                block.push_str("...");
            }
        } else {
            block.push_str("(extraction pending or not available)");
        }
        block.push_str("\n");
    }
    block.push_str("---\n");
    block
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
    let project_block = project_memory_block(conn, thread_id);
    let attachment_block = attachment_summaries_block(conn, thread_id);
    let extra_blocks = format!("{}{}", project_block, attachment_block);
    if provider_manages_context(provider) {
        let system = prompts::load_system_prompt_with_mode(prompt_mode);
        let system = if extra_blocks.is_empty() {
            system
        } else {
            format!("{}{}", system, extra_blocks)
        };
        ChatRequest {
            prompt: current_prompt.to_string(),
            system: Some(system),
            context: vec![],
        }
    } else {
        let full_prompt = build_full_prompt(conn, thread_id, current_prompt, prompt_mode, &extra_blocks);
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
    extra_blocks: &str,
) -> String {
    let mut system_prompt = prompts::load_system_prompt_with_mode(prompt_mode);
    if !extra_blocks.is_empty() {
        system_prompt.push_str(extra_blocks);
    }

    let mut history = String::new();
    if let Some(tid) = thread_id {
        if let Ok(messages) = queries::list_messages(conn, tid) {
            // The current user message was already saved to the DB before this call,
            // so we skip the last entry to avoid duplicating it at the end of the prompt.
            let prior = if messages.last().map(|m| m.role.as_str()) == Some("user") {
                &messages[..messages.len().saturating_sub(1)]
            } else {
                &messages[..]
            };
            for msg in prior {
                let role_label = if msg.role == "user" { "User" } else { "Assistant" };
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
