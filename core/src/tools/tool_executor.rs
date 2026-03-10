use super::tool_registry::ToolRegistry;

pub struct ToolExecutor {
    registry: ToolRegistry,
}

impl ToolExecutor {
    pub fn new(registry: ToolRegistry) -> Self {
        Self { registry }
    }

    pub fn execute(&self, tool_name: &str, input: &str) -> anyhow::Result<String> {
        let tool = self
            .registry
            .get(tool_name)
            .ok_or_else(|| anyhow::anyhow!("Tool '{}' not found", tool_name))?;
        tool(input)
    }
}
