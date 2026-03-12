use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbThread {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    /// Number of messages in this thread (for list_threads / create_thread).
    pub message_count: i64,
}
