//! Generic OpenAI-compatible API provider.
//! Works with any service exposing /v1/chat/completions (OpenAI, Anthropic via proxy, etc.).
//! Provider name kept as "custom" for backward compatibility with existing settings.

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};
use crate::tools::{executor, registry};

pub struct ApiProvider {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
    client: Client,
}

impl ApiProvider {
    pub fn new(endpoint: String, model: String, api_key: Option<String>) -> Self {
        Self {
            endpoint,
            model,
            api_key,
            client: Client::new(),
        }
    }

    fn build_messages(&self, req: &ChatRequest) -> Vec<OpenAIMessage> {
        let mut messages = Vec::new();

        if let Some(system) = &req.system {
            messages.push(OpenAIMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }

        // Conversation history
        for msg in &req.messages {
            messages.push(OpenAIMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        // Current user message
        messages.push(OpenAIMessage {
            role: "user".to_string(),
            content: req.prompt.clone(),
        });

        messages
    }

    fn build_request(&self, url: &str, body: &impl Serialize) -> reqwest::RequestBuilder {
        let mut request = self.client.post(url).json(body);

        if let Some(key) = &self.api_key {
            if !key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", key));
            }
        }

        request
    }
}

// --- OpenAI-compatible wire types (kept private to provider) ---

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessageResponse,
}

#[derive(Deserialize)]
struct OpenAIMessageResponse {
    content: String,
}

// --- Extended streaming types for tool calling ---

#[derive(Deserialize)]
struct OpenAIStreamChunk {
    choices: Vec<OpenAIStreamChoice>,
}

#[derive(Deserialize)]
struct OpenAIStreamChoice {
    delta: OpenAIDelta,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct OpenAIDelta {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Deserialize)]
struct ToolCallDelta {
    index: usize,
    id: Option<String>,
    function: Option<FunctionDelta>,
}

#[derive(Deserialize)]
struct FunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

// Event types for tool call notifications
#[derive(Debug, Clone, serde::Serialize)]
pub struct ToolCallEvent {
    pub name: String,
    pub args: Value,
    pub result: Option<String>,
    pub status: String, // "running" | "done" | "error"
}

impl ApiProvider {
    /// Agentic stream: sends tools along with the request and handles the
    /// tool-calling loop automatically. For each tool call the AI requests,
    /// `on_tool_event` is called twice: once before execution (status="running")
    /// and once after (status="done"|"error").
    pub async fn agentic_stream<F>(
        &self,
        req: ChatRequest,
        tx: mpsc::Sender<String>,
        on_tool_event: F,
    ) -> Result<(), AIError>
    where
        F: Fn(ToolCallEvent) + Send + Sync,
    {
        let tools: Vec<Value> = registry::built_in_tools()
            .iter()
            .map(registry::to_openai_tool)
            .collect();

        // Build initial messages list as JSON Values (needed for tool messages)
        let mut messages: Vec<Value> = Vec::new();
        if let Some(system) = &req.system {
            messages.push(json!({"role": "system", "content": system}));
        }
        for msg in &req.messages {
            messages.push(json!({"role": msg.role, "content": msg.content}));
        }
        messages.push(json!({"role": "user", "content": req.prompt}));

        let url = format!("{}/v1/chat/completions", self.endpoint.trim_end_matches('/'));
        const MAX_ROUNDS: usize = 10;

        for _round in 0..MAX_ROUNDS {
            let body = json!({
                "model": self.model,
                "messages": messages,
                "tools": tools,
                "stream": true,
            });

            let mut resp = self
                .build_request(&url, &body)
                .send()
                .await
                .map_err(|e| AIError::NetworkError(e.to_string()))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(AIError::ProviderError(format!(
                    "API error {}: {}",
                    status, text
                )));
            }

            let mut buffer = String::new();
            let mut partial_tool_calls: HashMap<usize, PartialToolCall> = HashMap::new();
            let mut finish_reason: Option<String> = None;

            'stream: while let Some(chunk) = resp
                .chunk()
                .await
                .map_err(|e| AIError::NetworkError(e.to_string()))?
            {
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }
                    if line == "data: [DONE]" {
                        break 'stream;
                    }

                    if let Some(json_str) = line.strip_prefix("data: ") {
                        if let Ok(sc) = serde_json::from_str::<OpenAIStreamChunk>(json_str) {
                            if let Some(choice) = sc.choices.first() {
                                if let Some(fr) = &choice.finish_reason {
                                    finish_reason = Some(fr.clone());
                                }
                                // Accumulate text
                                if let Some(content) = &choice.delta.content {
                                    if !content.is_empty() && tx.send(content.clone()).await.is_err() {
                                        return Ok(());
                                    }
                                }
                                // Accumulate tool call deltas
                                if let Some(deltas) = &choice.delta.tool_calls {
                                    for d in deltas {
                                        let entry = partial_tool_calls
                                            .entry(d.index)
                                            .or_insert_with(|| PartialToolCall {
                                                id: String::new(),
                                                name: String::new(),
                                                arguments: String::new(),
                                            });
                                        if let Some(id) = &d.id {
                                            entry.id.clone_from(id);
                                        }
                                        if let Some(func) = &d.function {
                                            if let Some(n) = &func.name {
                                                entry.name.clone_from(n);
                                            }
                                            if let Some(a) = &func.arguments {
                                                entry.arguments.push_str(a);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let is_tool_call = finish_reason.as_deref() == Some("tool_calls")
                || (!partial_tool_calls.is_empty() && finish_reason.as_deref() != Some("stop"));

            if !is_tool_call || partial_tool_calls.is_empty() {
                // Normal stop — we're done
                break;
            }

            // Sort tool calls by index
            let mut sorted: Vec<_> = partial_tool_calls.into_iter().collect();
            sorted.sort_by_key(|(k, _)| *k);

            // Build assistant message with tool_calls array
            let tool_calls_json: Vec<Value> = sorted
                .iter()
                .map(|(_, tc)| {
                    json!({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments,
                        }
                    })
                })
                .collect();

            messages.push(json!({
                "role": "assistant",
                "content": null,
                "tool_calls": tool_calls_json,
            }));

            // Execute each tool and append results
            for (_, tc) in &sorted {
                let args: Value = serde_json::from_str(&tc.arguments)
                    .unwrap_or(Value::Object(serde_json::Map::new()));

                on_tool_event(ToolCallEvent {
                    name: tc.name.clone(),
                    args: args.clone(),
                    result: None,
                    status: "running".to_string(),
                });

                let result = executor::execute_tool(&tc.name, &args)
                    .unwrap_or_else(|e| format!("Error: {}", e));

                on_tool_event(ToolCallEvent {
                    name: tc.name.clone(),
                    args: args.clone(),
                    result: Some(result.clone()),
                    status: "done".to_string(),
                });

                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                }));
            }
            // Loop again with tool results injected
        }

        Ok(())
    }
}

#[async_trait]
impl AIProvider for ApiProvider {
    fn name(&self) -> &str {
        "custom"
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let body = OpenAIRequest {
            model: self.model.clone(),
            messages: self.build_messages(&req),
            stream: None,
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.endpoint.trim_end_matches('/')
        );

        let resp = self
            .build_request(&url, &body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AIError::ProviderError(format!(
                "API error {}: {}",
                status, text
            )));
        }

        let data: OpenAIResponse = resp
            .json()
            .await
            .map_err(|e| AIError::ParseError(e.to_string()))?;

        let text = data
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        Ok(ChatResponse { text })
    }

    async fn chat_stream(&self, req: ChatRequest, tx: mpsc::Sender<String>) -> Result<(), AIError> {
        let body = OpenAIRequest {
            model: self.model.clone(),
            messages: self.build_messages(&req),
            stream: Some(true),
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.endpoint.trim_end_matches('/')
        );

        let mut resp = self
            .build_request(&url, &body)
            .send()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AIError::ProviderError(format!(
                "API error {}: {}",
                status, text
            )));
        }

        let mut buffer = String::new();

        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| AIError::NetworkError(e.to_string()))?
        {
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if line == "data: [DONE]" {
                    return Ok(());
                }

                if let Some(json_str) = line.strip_prefix("data: ") {
                    if let Ok(stream_chunk) = serde_json::from_str::<OpenAIStreamChunk>(json_str) {
                        if let Some(choice) = stream_chunk.choices.first() {
                            if let Some(content) = &choice.delta.content {
                                if !content.is_empty() {
                                    if tx.send(content.clone()).await.is_err() {
                                        return Ok(());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
