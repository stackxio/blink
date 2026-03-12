pub const SQL: &str = "CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        root_path TEXT,
        scope_mode TEXT NOT NULL CHECK(scope_mode IN ('system','directory')) DEFAULT 'system',
        icon TEXT NOT NULL DEFAULT 'Folder',
        color TEXT NOT NULL DEFAULT '#6b7280',
        shared_context_summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );";
