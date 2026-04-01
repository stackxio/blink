use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "untracked", "renamed"
    pub staged: bool,
}

#[derive(Debug, Serialize)]
pub struct GitCommitInfo {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        // Some commands write to stderr but still succeed (e.g., warnings)
        if stderr.contains("fatal:") || stderr.contains("error:") {
            return Err(stderr);
        }
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_status_code(x: u8, y: u8) -> Vec<GitFileStatus> {
    // This is used by git_status to parse porcelain v1 output
    // x = index status, y = worktree status
    let _ = (x, y);
    vec![]
}

#[tauri::command]
pub fn git_status(path: String) -> Result<Vec<GitFileStatus>, String> {
    let output = run_git(&path, &["status", "--porcelain=v1", "-uall"])?;
    let mut files = Vec::new();

    for line in output.lines() {
        if line.len() < 4 {
            continue;
        }
        let x = line.as_bytes()[0];
        let y = line.as_bytes()[1];
        let file_path = &line[3..];

        // Handle renames: "R  old -> new"
        let display_path = if file_path.contains(" -> ") {
            file_path
                .split(" -> ")
                .last()
                .unwrap_or(file_path)
                .to_string()
        } else {
            file_path.to_string()
        };

        // Staged changes (index column)
        match x {
            b'M' => files.push(GitFileStatus {
                path: display_path.clone(),
                status: "modified".into(),
                staged: true,
            }),
            b'A' => files.push(GitFileStatus {
                path: display_path.clone(),
                status: "added".into(),
                staged: true,
            }),
            b'D' => files.push(GitFileStatus {
                path: display_path.clone(),
                status: "deleted".into(),
                staged: true,
            }),
            b'R' => files.push(GitFileStatus {
                path: display_path.clone(),
                status: "renamed".into(),
                staged: true,
            }),
            _ => {}
        }

        // Unstaged changes (worktree column)
        match y {
            b'M' => files.push(GitFileStatus {
                path: display_path.clone(),
                status: "modified".into(),
                staged: false,
            }),
            b'D' => files.push(GitFileStatus {
                path: display_path.clone(),
                status: "deleted".into(),
                staged: false,
            }),
            b'?' => files.push(GitFileStatus {
                path: display_path,
                status: "untracked".into(),
                staged: false,
            }),
            _ => {}
        }
    }

    Ok(files)
}

#[tauri::command]
pub fn git_diff(path: String, file_path: String) -> Result<String, String> {
    // Try unstaged diff first
    let diff = run_git(&path, &["diff", "--", &file_path])?;
    if !diff.trim().is_empty() {
        return Ok(diff);
    }
    // Try staged diff
    let staged_diff = run_git(&path, &["diff", "--cached", "--", &file_path])?;
    if !staged_diff.trim().is_empty() {
        return Ok(staged_diff);
    }
    // For untracked files, show the file content as a diff
    let status = run_git(&path, &["status", "--porcelain", "--", &file_path])?;
    if status.trim().starts_with("??") {
        let content = run_git(&path, &["show", &format!(":{}", file_path)]);
        match content {
            Ok(c) => Ok(c),
            Err(_) => {
                // Read the file directly for untracked files
                let full_path = std::path::Path::new(&path).join(&file_path);
                std::fs::read_to_string(&full_path)
                    .map(|c| format!("(new file)\n\n{}", c))
                    .map_err(|e| format!("Failed to read file: {}", e))
            }
        }
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
pub fn git_branch(path: String) -> Result<String, String> {
    let output = run_git(&path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(output.trim().to_string())
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<String>, String> {
    let output = run_git(&path, &["branch", "--format=%(refname:short)"])?;
    let branches: Vec<String> = output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    Ok(branches)
}

#[tauri::command]
pub fn git_log(path: String, limit: Option<u32>) -> Result<Vec<GitCommitInfo>, String> {
    let limit_str = format!("-{}", limit.unwrap_or(50));
    let output = run_git(
        &path,
        &["log", &limit_str, "--pretty=format:%H%x1f%s%x1f%an%x1f%ai"],
    )?;

    let commits: Vec<GitCommitInfo> = output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\x1f').collect();
            if parts.len() >= 4 {
                Some(GitCommitInfo {
                    hash: parts[0].to_string(),
                    message: parts[1].to_string(),
                    author: parts[2].to_string(),
                    date: parts[3].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
pub fn git_stage(path: String, file_path: String) -> Result<(), String> {
    run_git(&path, &["add", "--", &file_path])?;
    Ok(())
}

#[tauri::command]
pub fn git_unstage(path: String, file_path: String) -> Result<(), String> {
    run_git(&path, &["reset", "HEAD", "--", &file_path])?;
    Ok(())
}

#[tauri::command]
pub fn git_commit(path: String, message: String) -> Result<String, String> {
    let output = run_git(&path, &["commit", "-m", &message])?;
    Ok(output)
}

#[tauri::command]
pub fn git_checkout_branch(path: String, branch: String) -> Result<(), String> {
    run_git(&path, &["checkout", &branch])?;
    Ok(())
}

#[tauri::command]
pub fn git_push(path: String) -> Result<String, String> {
    run_git(&path, &["push"])
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    run_git(&path, &["pull"])
}

#[tauri::command]
pub fn git_create_branch(path: String, branch: String) -> Result<(), String> {
    run_git(&path, &["checkout", "-b", &branch])?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct BlameInfo {
    pub author: String,
    pub date: String,
    pub summary: String,
}

/// Get git blame info for a specific line in a file.
#[tauri::command]
pub fn git_blame_line(
    path: String,
    file_path: String,
    line: u32,
) -> Result<Option<BlameInfo>, String> {
    let output = run_git(
        &path,
        &[
            "blame",
            "-L",
            &format!("{},{}", line, line),
            "--porcelain",
            &file_path,
        ],
    )?;

    let mut author = String::new();
    let mut date = String::new();
    let mut summary = String::new();

    for l in output.lines() {
        if let Some(v) = l.strip_prefix("author ") {
            author = v.to_string();
        }
        if let Some(v) = l.strip_prefix("author-time ") {
            if let Ok(ts) = v.parse::<i64>() {
                let dt = chrono::DateTime::from_timestamp(ts, 0);
                if let Some(dt) = dt {
                    date = chrono::DateTime::<chrono::Utc>::from(dt)
                        .format("%Y-%m-%d")
                        .to_string();
                }
            }
        }
        if let Some(v) = l.strip_prefix("summary ") {
            summary = v.to_string();
        }
    }

    if author.is_empty() || author == "Not Committed Yet" {
        return Ok(None);
    }

    Ok(Some(BlameInfo {
        author,
        date,
        summary,
    }))
}
