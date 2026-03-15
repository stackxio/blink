use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbAttachment {
    pub id: String,
    pub project_id: Option<String>,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub file_path: String,
    pub size_bytes: i64,
    pub extraction_status: String,
    pub extracted_text_path: Option<String>,
    pub preview_text: Option<String>,
    pub created_at: String,
}
