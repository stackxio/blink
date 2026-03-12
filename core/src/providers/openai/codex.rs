use async_trait::async_trait;
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::providers::traits::AIProvider;
use crate::providers::types::{AIError, ChatRequest, ChatResponse};

pub struct CodexProvider {
    pub model: String,
}

impl CodexProvider {
    pub fn new(model: String) -> Self {
        Self { model }
    }
}

#[async_trait]
impl AIProvider for CodexProvider {
    fn name(&self) -> &str {
        "codex"
    }

    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let prompt = if let Some(system) = &req.system {
            format!("{}\n\n{}", system, req.prompt)
        } else {
            req.prompt.clone()
        };

        let mut cmd = Command::new("/opt/homebrew/bin/codex");
        cmd.arg("exec").arg(&prompt);

        let output = cmd
            .output()
            .await
            .map_err(|e| AIError::ProviderError(format!("Failed to run codex CLI: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AIError::ProviderError(format!(
                "codex CLI exited with {}: {}",
                output.status, stderr
            )));
        }

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(ChatResponse { text })
    }

    async fn chat_stream(&self, req: ChatRequest, tx: mpsc::Sender<String>) -> Result<(), AIError> {
        let response = self.chat(req).await?;
        let _ = tx.send(response.text).await;
        Ok(())
    }
}
