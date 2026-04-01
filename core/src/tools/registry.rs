use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

/// Convert ToolDefinition to OpenAI-compatible tool object.
pub fn to_openai_tool(t: &ToolDefinition) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": t.name,
            "description": t.description,
            "parameters": t.parameters,
        }
    })
}

pub fn built_in_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read_file".to_string(),
            description: "Read the full contents of a file at the given path.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute path to the file" }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "write_file".to_string(),
            description: "Write content to a file, creating it if it does not exist.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute path to the file" },
                    "content": { "type": "string", "description": "Content to write" }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "list_dir".to_string(),
            description: "List files and directories in a directory.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute path to the directory" }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "run_command".to_string(),
            description: "Run a shell command and return its stdout/stderr output.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "Shell command to run" },
                    "cwd": { "type": "string", "description": "Working directory (optional)" }
                },
                "required": ["command"]
            }),
        },
        ToolDefinition {
            name: "search_files".to_string(),
            description: "Search for a text pattern across files in a directory (grep-style).".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "root": { "type": "string", "description": "Root directory to search" },
                    "pattern": { "type": "string", "description": "Text or regex pattern to search for" }
                },
                "required": ["root", "pattern"]
            }),
        },
    ]
}
