use rusqlite::{params, Connection, Result};

use crate::db::models::DbProjectMemory;

pub fn list_by_project(conn: &Connection, project_id: &str) -> Result<Vec<DbProjectMemory>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, source_type, source_id, content, priority, created_at, updated_at
         FROM project_memories
         WHERE project_id = ?1
         ORDER BY priority DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(DbProjectMemory {
            id: row.get(0)?,
            project_id: row.get(1)?,
            source_type: row.get(2)?,
            source_id: row.get(3)?,
            content: row.get(4)?,
            priority: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn insert_project_memory(
    conn: &Connection,
    id: &str,
    project_id: &str,
    source_type: &str,
    source_id: Option<&str>,
    content: &str,
    priority: i64,
) -> Result<DbProjectMemory> {
    conn.execute(
        "INSERT INTO project_memories (id, project_id, source_type, source_id, content, priority)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, project_id, source_type, source_id, content, priority],
    )?;
    conn.query_row(
        "SELECT id, project_id, source_type, source_id, content, priority, created_at, updated_at
         FROM project_memories WHERE id = ?1",
        params![id],
        |row| {
            Ok(DbProjectMemory {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_type: row.get(2)?,
                source_id: row.get(3)?,
                content: row.get(4)?,
                priority: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
}
