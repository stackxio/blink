use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct McpConfig {
    servers: Vec<McpServerConfig>,
}

fn mcp_config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("caret")
        .join("mcp.json")
}

fn load_mcp_config() -> McpConfig {
    let path = mcp_config_path();
    if !path.exists() {
        return McpConfig::default();
    }
    let contents = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&contents).unwrap_or_default()
}

fn save_mcp_config(config: &McpConfig) -> anyhow::Result<()> {
    let path = mcp_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_string_pretty(config)?)?;
    Ok(())
}

#[tauri::command]
pub fn list_mcp_servers() -> Result<Vec<McpServerConfig>, String> {
    Ok(load_mcp_config().servers)
}

#[tauri::command]
pub fn add_mcp_server(server: McpServerConfig) -> Result<(), String> {
    let mut config = load_mcp_config();
    // Replace if already exists by name
    config.servers.retain(|s| s.name != server.name);
    config.servers.push(server);
    save_mcp_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_mcp_server(name: String) -> Result<(), String> {
    let mut config = load_mcp_config();
    config.servers.retain(|s| s.name != name);
    save_mcp_config(&config).map_err(|e| e.to_string())
}
