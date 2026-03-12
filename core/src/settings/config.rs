use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaretSettings {
    pub active_provider: String,
    #[serde(default = "default_prompt_mode")]
    pub prompt_mode: String,
    #[serde(default = "default_follow_up_behavior")]
    pub follow_up_behavior: String,
    #[serde(default = "default_show_actions_in_chat")]
    pub show_actions_in_chat: bool,
    pub codex: CodexSettings,
    pub ollama: OllamaSettings,
    pub custom: CustomSettings,
    #[serde(default)]
    pub claude_code: ClaudeCodeSettings,
}

fn default_prompt_mode() -> String {
    "full".to_string()
}

fn default_follow_up_behavior() -> String {
    "queue".to_string()
}

fn default_show_actions_in_chat() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexSettings {
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaSettings {
    pub endpoint: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomSettings {
    pub endpoint: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeCodeSettings {
    pub model: String,
}

impl Default for ClaudeCodeSettings {
    fn default() -> Self {
        Self {
            model: "sonnet".to_string(),
        }
    }
}

impl Default for CaretSettings {
    fn default() -> Self {
        Self {
            active_provider: "codex".to_string(),
            prompt_mode: "full".to_string(),
            follow_up_behavior: "queue".to_string(),
            show_actions_in_chat: true,
            codex: CodexSettings {
                model: "gpt-5.4".to_string(),
            },
            ollama: OllamaSettings {
                endpoint: "http://localhost:11434".to_string(),
                model: "llama3".to_string(),
            },
            custom: CustomSettings {
                endpoint: String::new(),
                model: String::new(),
                api_key: String::new(),
            },
            claude_code: ClaudeCodeSettings::default(),
        }
    }
}
