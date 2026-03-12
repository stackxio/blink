pub const SQL: &str = "CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        icon TEXT NOT NULL DEFAULT 'Folder',
        color TEXT NOT NULL DEFAULT '#6b7280',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );";
