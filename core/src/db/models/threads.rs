use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbThread {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub root_path_override: Option<String>,
    pub scope_mode_override: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    /// Number of messages in this thread (for list_threads / create_thread).
    pub message_count: i64,
}
