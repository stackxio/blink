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

    log::info!("init_db: ready");
    Ok(conn)
}
