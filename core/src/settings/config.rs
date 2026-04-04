use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlinkSettings {
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
    #[serde(default)]
    pub editor: EditorSettings,
    #[serde(default)]
    pub appearance: AppearanceSettings,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings {
    #[serde(default = "default_auto_save")]
    pub auto_save: bool,
    #[serde(default = "default_tab_size")]
    pub tab_size: u8,
    #[serde(default = "default_font_size")]
    pub font_size: u8,
    #[serde(default)]
    pub word_wrap: bool,
    #[serde(default = "default_minimap")]
    pub minimap: bool,
    #[serde(default = "default_indent_guides")]
    pub indent_guides: bool,
    #[serde(default = "default_true")]
    pub sticky_scroll: bool,
    #[serde(default = "default_true")]
    pub inlay_hints: bool,
    #[serde(default = "default_true")]
    pub code_actions: bool,
    #[serde(default = "default_true")]
    pub diff_editor: bool,
    #[serde(default)]
    pub inline_completions: bool,
}

fn default_auto_save() -> bool {
    true
}
fn default_tab_size() -> u8 {
    2
}
fn default_font_size() -> u8 {
    13
}
fn default_minimap() -> bool {
    true
}
fn default_indent_guides() -> bool {
    true
}
fn default_true() -> bool {
    true
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            auto_save: true,
            tab_size: 2,
            font_size: 13,
            word_wrap: false,
            minimap: true,
            indent_guides: true,
            sticky_scroll: true,
            inlay_hints: true,
            code_actions: true,
            diff_editor: true,
            inline_completions: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSettings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
}

fn default_theme() -> String {
    "dark".to_string()
}
fn default_font_family() -> String {
    "default".to_string()
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_family: "default".to_string(),
        }
    }
}

impl Default for BlinkSettings {
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
            editor: EditorSettings::default(),
            appearance: AppearanceSettings::default(),
        }
    }
}
