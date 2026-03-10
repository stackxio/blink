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

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("Failed to create ~/.caret directory");
    }

    let conn = Connection::open(&path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    for migration in MIGRATIONS {
        // ALTER TABLE migrations may fail if column already exists — that's fine
        if let Err(e) = conn.execute_batch(migration) {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column") {
                return Err(e);
            }
        }
    }

    Ok(conn)
}
