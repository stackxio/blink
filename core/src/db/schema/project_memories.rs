pub const SQL: &str = "CREATE TABLE IF NOT EXISTS project_memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('thread_summary','attachment_summary','manual_note','system_fact')),
        source_id TEXT,
        content TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES folders(id) ON DELETE CASCADE
    );";
