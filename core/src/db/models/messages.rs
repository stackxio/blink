use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbMessage {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub duration_ms: Option<i64>,
    pub created_at: String,
}
