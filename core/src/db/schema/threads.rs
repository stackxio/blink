pub const SQL: &str = "CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        folder_id TEXT,
        title TEXT NOT NULL DEFAULT 'New chat',
        root_path_override TEXT,
        scope_mode_override TEXT NOT NULL CHECK(scope_mode_override IN ('inherit','system','directory')) DEFAULT 'inherit',
        codex_thread_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        archived_at TEXT,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );";
