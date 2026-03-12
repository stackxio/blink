use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbFolder {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub root_path: Option<String>,
    pub scope_mode: String,
    pub icon: String,
    pub color: String,
    pub shared_context_summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
