use serde::Serialize;
use serde_json::json;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::time::{timeout, Duration};

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

use crate::commands::blink_code_bridge::BRIDGE_JS;

fn default_bridge_script(app: &AppHandle) -> std::path::PathBuf {
    if !BRIDGE_JS.is_empty() {
        if let Ok(cache_dir) = app.path().app_cache_dir() {
            let _ = std::fs::create_dir_all(&cache_dir);
            let dest = cache_dir.join("ide-bridge.js");
            if std::fs::write(&dest, BRIDGE_JS).is_ok() {
                return dest;
            }
        }
    }
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../packages/blink-code/ide-bridge.ts")
        .canonicalize()
        .unwrap_or_else(|_| {
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../packages/blink-code/ide-bridge.ts")
        })
}

const MAX_COMMIT_DIFF_CHARS: usize = 60_000;
const MAX_UNTRACKED_FILES_FOR_COMMIT_PROMPT: usize = 24;
const MAX_UNTRACKED_FILE_CHARS: usize = 2_000;

fn truncate_for_commit_prompt(text: String, limit: usize) -> String {
    if text.len() <= limit {
        text
    } else {
        format!(
            "{}\n...[truncated: showing first {} of {} chars]",
            &text[..limit],
            limit,
            text.len()
        )
    }
}

fn sanitize_commit_message(raw: &str) -> String {
    fn strip_wrapping(mut line: String) -> String {
        loop {
            let trimmed = line.trim().to_string();
            let unwrapped = trimmed
                .trim_matches('`')
                .trim_matches('"')
                .trim_matches('\'')
                .trim()
                .to_string();
            if unwrapped == line {
                return unwrapped;
            }
            line = unwrapped;
        }
    }

    fn looks_like_commit_message(line: &str) -> bool {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.len() > 100 {
            return false;
        }

        let lower = trimmed.to_lowercase();
        if [
            "the changes you provided",
            "these changes",
            "this diff",
            "the diff",
            "the update",
            "the changes include",
            "summary",
            "overview",
            "description",
            "this file",
            "the file",
            "imports",
            "type definitions",
            "function declarations",
            "across various files",
            "part of",
            "supports different",
            "here is",
            "here's",
            "below is",
            "i would suggest",
            "i'd suggest",
            "you can use",
        ]
        .iter()
        .any(|needle| lower.contains(needle))
        {
            return false;
        }

        if trimmed.starts_with('#')
            || trimmed.starts_with("//")
            || trimmed.starts_with("/*")
            || trimmed.starts_with("import ")
            || trimmed.starts_with("export ")
            || trimmed.starts_with('{')
            || trimmed.starts_with('[')
        {
            return false;
        }

        let word_count = trimmed.split_whitespace().count();
        if word_count < 2 || word_count > 14 {
            return false;
        }

        true
    }

    fn strip_common_prefixes(line: &str) -> Option<String> {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed == "```" {
            return None;
        }

        let mut normalized = trimmed
            .trim_start_matches("- ")
            .trim_start_matches("* ")
            .trim_start_matches("> ")
            .trim()
            .to_string();

        let lower = normalized.to_lowercase();
        for prefix in [
            "commit:",
            "commit message:",
            "suggested commit message:",
            "generated commit message:",
            "message:",
            "title:",
        ] {
            if lower.starts_with(prefix) {
                normalized = normalized[prefix.len()..].trim().to_string();
                break;
            }
        }

        if normalized.is_empty() {
            return None;
        }

        let lower = normalized.to_lowercase();
        if [
            "here is",
            "here's",
            "the commit message",
            "a commit message",
            "this commit message",
            "this commit",
            "i would use",
            "you can use",
            "based on the diff",
            "for these changes",
            "summary of changes",
            "the changes you provided",
        ]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        {
            return None;
        }

        let normalized = strip_wrapping(normalized);
        if normalized.is_empty() {
            return None;
        }
        Some(normalized)
    }

    let cleaned_lines = raw
        .lines()
        .filter_map(strip_common_prefixes)
        .flat_map(|line| {
            let first_sentence = line
                .split(['\n', '.', '!', '?'])
                .next()
                .map(str::trim)
                .unwrap_or("")
                .to_string();
            if first_sentence != line {
                vec![line, first_sentence]
            } else {
                vec![line]
            }
        })
        .map(strip_wrapping)
        .filter(|line| looks_like_commit_message(line))
        .collect::<Vec<_>>();

    if let Some(conventional) = cleaned_lines.iter().find(|line| {
        let head = line.split_once(':').map(|(head, _)| head).unwrap_or("");
        !head.is_empty()
            && head
                .chars()
                .all(|ch| ch.is_ascii_lowercase() || matches!(ch, '(' | ')' | '!' | '-' | '/'))
    }) {
        return conventional.trim().to_string();
    }

    cleaned_lines
        .into_iter()
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn build_commit_diff(path: &str, staged_only: bool) -> Result<String, String> {
    let mut sections = Vec::new();

    let stat_args = if staged_only {
        vec![
            "diff",
            "--cached",
            "--stat",
            "--find-renames",
            "--no-ext-diff",
        ]
    } else {
        vec!["diff", "--stat", "--find-renames", "--no-ext-diff"]
    };
    let patch_args = if staged_only {
        vec![
            "diff",
            "--cached",
            "--patch",
            "--find-renames",
            "--no-ext-diff",
            "--unified=2",
        ]
    } else {
        vec![
            "diff",
            "--patch",
            "--find-renames",
            "--no-ext-diff",
            "--unified=2",
        ]
    };

    let diff_stat = run_git(path, &stat_args)?;
    if !diff_stat.trim().is_empty() {
        sections.push(format!("Diff summary:\n{}", diff_stat.trim()));
    }

    let patch = run_git(path, &patch_args)?;
    if !patch.trim().is_empty() {
        sections.push(format!(
            "Patch excerpt:\n{}",
            truncate_for_commit_prompt(patch, MAX_COMMIT_DIFF_CHARS / 2)
        ));
    }

    if !staged_only {
        let untracked = git_status(path.to_string())?
            .into_iter()
            .filter(|f| f.status == "untracked")
            .collect::<Vec<_>>();

        if !untracked.is_empty() {
            let mut block = format!(
                "\n\nUntracked files (showing up to {}):\n",
                MAX_UNTRACKED_FILES_FOR_COMMIT_PROMPT
            );
            for file in untracked
                .into_iter()
                .take(MAX_UNTRACKED_FILES_FOR_COMMIT_PROMPT)
            {
                let full_path = std::path::Path::new(path).join(&file.path);
                let content = std::fs::read_to_string(&full_path).unwrap_or_default();
                let truncated = truncate_for_commit_prompt(content, MAX_UNTRACKED_FILE_CHARS);
                block.push_str(&format!(
                    "\n--- {} ---\n{}\n",
                    file.path,
                    if truncated.trim().is_empty() {
                        "(empty file)".to_string()
                    } else {
                        truncated
                    }
                ));
            }
            sections.push(block);
        }
    }

    let combined = sections
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let combined = truncate_for_commit_prompt(combined, MAX_COMMIT_DIFF_CHARS);

    if combined.trim().is_empty() {
        Err("No diff available to summarize.".to_string())
    } else {
        Ok(combined)
    }
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
pub async fn git_generate_commit_message(
    app: AppHandle,
    path: String,
    provider: serde_json::Value,
    staged_only: Option<bool>,
) -> Result<String, String> {
    let diff = build_commit_diff(&path, staged_only.unwrap_or(true))?;
    let script = default_bridge_script(&app);
    if !script.is_file() {
        return Err(format!("Bridge script not found: {}", script.display()));
    }

    let script_str = script
        .to_str()
        .ok_or_else(|| "Bridge script path is not valid UTF-8".to_string())?
        .to_string();

    let mut child = TokioCommand::new("bun")
        .arg("run")
        .arg(&script_str)
        .current_dir(&path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn bun run {}: {}", script_str, e))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not capture bridge stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not capture bridge stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not capture bridge stderr".to_string())?;

    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        let mut out = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => out.push_str(&line),
                Err(_) => break,
            }
        }
        out
    });

    let assistant_msg_id = "commit-message";
    let init_line = json!({
        "type": "init",
        "workspacePath": format!("{}#commit-message", path),
        "systemPrompt": "You write concise git commit messages. Reply with exactly one line in the format `COMMIT: <message>`. Prefer conventional commit style when it is clear from the diff. Keep it imperative, one line, and under 72 characters when possible. Do not add any explanation, bullets, labels besides `COMMIT:`, code fences, or extra lines.",
        "provider": provider,
        "maxTurns": 1,
        "requirePermission": false,
        "allowTools": false,
        "persistSession": false
    });
    let chat_line = json!({
        "type": "chat",
        "assistantMsgId": assistant_msg_id,
        "text": format!(
            "Generate a single git commit message for these changes.\nReply with exactly one line: `COMMIT: <message>`\nDo not include any explanation or extra text.\n\n{}",
            diff
        )
    });

    for payload in [init_line, chat_line] {
        let mut line = payload.to_string();
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Bridge stdin write failed: {}", e))?;
    }
    stdin
        .flush()
        .await
        .map_err(|e| format!("Bridge stdin flush failed: {}", e))?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    let mut result = String::new();
    let read_result = timeout(Duration::from_secs(45), async {
        loop {
            line.clear();
            let read = reader
                .read_line(&mut line)
                .await
                .map_err(|e| format!("Bridge stdout read failed: {}", e))?;
            if read == 0 {
                break;
            }
            let parsed: serde_json::Value = serde_json::from_str(line.trim())
                .map_err(|e| format!("Invalid bridge output: {}", e))?;
            match parsed.get("type").and_then(|v| v.as_str()) {
                Some("text_delta") => {
                    if parsed.get("assistantMsgId").and_then(|v| v.as_str())
                        == Some(assistant_msg_id)
                    {
                        if let Some(delta) = parsed.get("delta").and_then(|v| v.as_str()) {
                            result.push_str(delta);
                        }
                    }
                }
                Some("error") => {
                    let msg = parsed
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown bridge error");
                    return Err(msg.to_string());
                }
                Some("turn_done") => {
                    if parsed.get("assistantMsgId").and_then(|v| v.as_str())
                        == Some(assistant_msg_id)
                    {
                        break;
                    }
                }
                _ => {}
            }
        }
        Ok::<(), String>(())
    })
    .await;

    let _ = child.kill().await;
    let _ = child.wait().await;
    let stderr_output = stderr_task.await.unwrap_or_default();

    match read_result {
        Ok(Ok(())) => {
            let cleaned = sanitize_commit_message(&result);
            if cleaned.is_empty() {
                Err(if stderr_output.trim().is_empty() {
                    "AI returned an empty commit message.".to_string()
                } else {
                    stderr_output.trim().to_string()
                })
            } else {
                Ok(cleaned)
            }
        }
        Ok(Err(err)) => Err(err),
        Err(_) => Err("Timed out while generating commit message.".to_string()),
    }
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

#[tauri::command]
pub fn git_show(path: String, hash: String) -> Result<String, String> {
    run_git(&path, &["show", "--stat", "-p", &hash])
}

#[tauri::command]
pub async fn git_diff_file(path: String, file_path: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["-C", &path, "diff", "HEAD", "--", &file_path])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn git_stage_hunk(path: String, _file_path: String, patch: String) -> Result<(), String> {
    // Write patch to a temp file and apply it
    let tmp_path = format!(
        "/tmp/codrift-hunk-{}.patch",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    std::fs::write(&tmp_path, patch.as_bytes()).map_err(|e| e.to_string())?;
    let output = std::process::Command::new("git")
        .args([
            "-C",
            &path,
            "apply",
            "--cached",
            "--whitespace=nowarn",
            &tmp_path,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp_path);
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[derive(Debug, Serialize)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub date: String,
}

#[tauri::command]
pub fn git_stash_list(path: String) -> Result<Vec<StashEntry>, String> {
    let output = run_git(
        &path,
        &["stash", "list", "--format=%gd%x1f%s%x1f%ci"],
    )?;

    let entries: Vec<StashEntry> = output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\x1f').collect();
            if parts.len() >= 3 {
                // Extract numeric index from "stash@{N}"
                let ref_str = parts[0].trim();
                let index = ref_str
                    .trim_start_matches("stash@{")
                    .trim_end_matches('}')
                    .parse::<u32>()
                    .unwrap_or(0);
                Some(StashEntry {
                    index,
                    message: parts[1].to_string(),
                    date: parts[2].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn git_stash_push(path: String, message: Option<String>) -> Result<(), String> {
    match message {
        Some(msg) if !msg.trim().is_empty() => {
            run_git(&path, &["stash", "push", "-m", &msg])?;
        }
        _ => {
            run_git(&path, &["stash", "push"])?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn git_stash_pop(path: String, index: u32) -> Result<(), String> {
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(&path, &["stash", "pop", &stash_ref])?;
    Ok(())
}

#[tauri::command]
pub fn git_stash_drop(path: String, index: u32) -> Result<(), String> {
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(&path, &["stash", "drop", &stash_ref])?;
    Ok(())
}

/// Get the content of a file as it exists at HEAD (before any local modifications).
/// Returns empty string for untracked files.
#[tauri::command]
pub fn git_file_at_head(path: String, file_path: String) -> Result<String, String> {
    let rev_path = format!("HEAD:{}", file_path);
    let output = Command::new("git")
        .args(["show", &rev_path])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        // Untracked or new file — no HEAD version
        return Ok(String::new());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
