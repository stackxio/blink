use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaretSettings {
    pub active_provider: String,
    pub codex: CodexSettings,
    pub ollama: OllamaSettings,
    pub custom: CustomSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexSettings {
    pub api_key: String,
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
            codex: CodexSettings {
                api_key: String::new(),
                model: "codex-latest".to_string(),
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
