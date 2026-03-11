use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaretSettings {
    pub active_provider: String,
    #[serde(default = "default_prompt_mode")]
    pub prompt_mode: String,
    pub codex: CodexSettings,
    pub ollama: OllamaSettings,
    pub custom: CustomSettings,
}

fn default_prompt_mode() -> String {
    "full".to_string()
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

impl Default for CaretSettings {
    fn default() -> Self {
        Self {
            active_provider: "codex".to_string(),
            prompt_mode: "full".to_string(),
            codex: CodexSettings {
                model: String::new(),
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
        }
    }
}
