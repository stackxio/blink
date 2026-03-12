use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbFolder {
    pub id: String,
    pub name: String,
    pub position: i64,
    pub icon: String,
    pub color: String,
    pub created_at: String,
}
