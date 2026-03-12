use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;

use super::schema::MIGRATIONS;

fn db_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not determine home directory");
    home.join(".caret").join("caret.db")
}

pub fn init_db() -> rusqlite::Result<Connection> {
    let path = db_path();
    log::info!("init_db: path={:?}", path);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("Failed to create ~/.caret directory");
    }

    let conn = Connection::open(&path)?;
    log::info!("init_db: opened connection");

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    for migration in MIGRATIONS {
        conn.execute_batch(migration)?;
    }
    log::info!("init_db: migrations applied");

    // Optional migrations for existing DBs (e.g. add folder icon/color); ignore if columns exist
    let _ = conn.execute_batch("ALTER TABLE folders ADD COLUMN icon TEXT NOT NULL DEFAULT 'Folder'");
    let _ = conn.execute_batch("ALTER TABLE folders ADD COLUMN color TEXT NOT NULL DEFAULT '#6b7280'");

    log::info!("init_db: ready");
    Ok(conn)
}
