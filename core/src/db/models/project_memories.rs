use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbProjectMemory {
    pub id: String,
    pub project_id: String,
    pub source_type: String,
    pub source_id: Option<String>,
    pub content: String,
    pub priority: i64,
    pub created_at: String,
    pub updated_at: String,
}
