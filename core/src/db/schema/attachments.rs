pub const SQL: &str = "CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        thread_id TEXT,
        message_id TEXT,
        original_name TEXT NOT NULL,
        mime_type TEXT,
        file_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        extraction_status TEXT NOT NULL CHECK(extraction_status IN ('pending','complete','failed')) DEFAULT 'pending',
        extracted_text_path TEXT,
        preview_text TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES folders(id) ON DELETE SET NULL,
        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL
    );";
