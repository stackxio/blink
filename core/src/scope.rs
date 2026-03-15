//! Scope guard: validates that path operations stay within the effective scope
//! (system-wide or a chosen directory root).

use std::path::{Path, PathBuf};

/// Guard that enforces scope for filesystem operations.
/// - `system`: allow any path.
/// - `directory`: allow only paths under `root_path` (canonicalized).
#[derive(Debug, Clone)]
pub struct ScopeGuard {
    mode: String,
    root_path: Option<PathBuf>,
}

impl ScopeGuard {
    /// Create a guard. `root_path` is used only when `mode == "directory"`.
    pub fn new(mode: &str, root_path: Option<&str>) -> Self {
        let root_path = root_path.and_then(|s| {
            let p = PathBuf::from(s);
            if p.exists() {
                std::fs::canonicalize(&p).ok()
            } else {
                None
            }
        });
        Self {
            mode: mode.to_string(),
            root_path,
        }
    }

    /// Allow system scope (no path restrictions). Use when thread has no scope or mode is system.
    pub fn system() -> Self {
        Self {
            mode: "system".to_string(),
            root_path: None,
        }
    }

    /// Check that reading from `path` is allowed. Path is canonicalized if it exists.
    pub fn allow_read(&self, path: &Path) -> anyhow::Result<()> {
        if self.mode != "directory" {
            return Ok(());
        }
        let root = self
            .root_path
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Directory scope has no root path"))?;
        let canonical = if path.exists() {
            std::fs::canonicalize(path)?
        } else {
            path.to_path_buf()
        };
        check_under_root(&canonical, root)
    }

    /// Check that writing to `path` is allowed. Path or its parent is canonicalized when possible.
    pub fn allow_write(&self, path: &Path) -> anyhow::Result<()> {
        if self.mode != "directory" {
            return Ok(());
        }
        let root = self
            .root_path
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Directory scope has no root path"))?;
        let to_check = if path.exists() {
            std::fs::canonicalize(path)?
        } else if let Some(parent) = path.parent() {
            if parent.exists() {
                std::fs::canonicalize(parent)?.join(path.file_name().unwrap_or_default())
            } else {
                path.to_path_buf()
            }
        } else {
            path.to_path_buf()
        };
        check_under_root(&to_check, root)
    }
}

fn check_under_root(path: &Path, root: &Path) -> anyhow::Result<()> {
    let canonical_root = std::fs::canonicalize(root)?;
    let canonical_path = if path.exists() {
        std::fs::canonicalize(path)?
    } else if let Some(parent) = path.parent() {
        if parent.exists() {
            let canonical_parent = std::fs::canonicalize(parent)?;
            if !canonical_parent.starts_with(&canonical_root) {
                return Err(anyhow::anyhow!(
                    "Path {} is outside scope root {}",
                    path.display(),
                    canonical_root.display()
                ));
            }
            canonical_parent.join(path.file_name().unwrap_or_default())
        } else {
            path.to_path_buf()
        }
    } else {
        path.to_path_buf()
    };
    if canonical_path.starts_with(&canonical_root) {
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "Path {} is outside scope root {}",
            canonical_path.display(),
            canonical_root.display()
        ))
    }
}
