use crate::tools::{executor, registry};
use serde_json::Value;

#[tauri::command]
pub fn tool_list() -> Vec<registry::ToolDefinition> {
    registry::built_in_tools()
}

#[tauri::command]
pub fn tool_execute(name: String, args: Value) -> Result<String, String> {
    executor::execute_tool(&name, &args)
}
