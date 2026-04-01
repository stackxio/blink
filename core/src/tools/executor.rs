use serde_json::Value;
use std::fs;
use std::process::Command;

/// Execute a tool by name with the given arguments JSON.
pub fn execute_tool(name: &str, args: &Value) -> Result<String, String> {
    match name {
        "read_file" => {
            let path = args["path"].as_str().ok_or("Missing required arg: path")?;
            let content =
                fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
            // Truncate very large files to prevent context overflow
            if content.len() > 50_000 {
                Ok(format!(
                    "{}...\n\n[File truncated — {} bytes total, showing first 50000]",
                    &content[..50_000],
                    content.len()
                ))
            } else {
                Ok(content)
            }
        }

        "write_file" => {
            let path = args["path"].as_str().ok_or("Missing required arg: path")?;
            let content = args["content"]
                .as_str()
                .ok_or("Missing required arg: content")?;
            if let Some(parent) = std::path::Path::new(path).parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(path, content).map_err(|e| format!("Failed to write {}: {}", path, e))?;
            Ok(format!("Wrote {} bytes to {}", content.len(), path))
        }

        "list_dir" => {
            let path = args["path"].as_str().ok_or("Missing required arg: path")?;
            let entries = fs::read_dir(path)
                .map_err(|e| format!("Failed to read directory {}: {}", path, e))?;
            let mut names: Vec<String> = entries
                .flatten()
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        format!("{}/", name)
                    } else {
                        name
                    }
                })
                .collect();
            names.sort();
            if names.is_empty() {
                Ok("(empty directory)".to_string())
            } else {
                Ok(names.join("\n"))
            }
        }

        "run_command" => {
            let cmd = args["command"]
                .as_str()
                .ok_or("Missing required arg: command")?;
            let cwd = args["cwd"].as_str();
            let mut command = Command::new("sh");
            command.arg("-c").arg(cmd);
            if let Some(dir) = cwd {
                command.current_dir(dir);
            }
            let output = command
                .output()
                .map_err(|e| format!("Failed to run command: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let mut result = String::new();
            if !stdout.is_empty() {
                result.push_str(stdout.trim_end());
            }
            if !stderr.is_empty() {
                if !result.is_empty() {
                    result.push('\n');
                }
                result.push_str("stderr: ");
                result.push_str(stderr.trim_end());
            }
            if result.is_empty() {
                result = "(no output)".to_string();
            }
            // Truncate long output
            if result.len() > 10_000 {
                result.truncate(10_000);
                result.push_str("\n...[truncated]");
            }
            Ok(result)
        }

        "search_files" => {
            let root = args["root"].as_str().ok_or("Missing required arg: root")?;
            let pattern = args["pattern"]
                .as_str()
                .ok_or("Missing required arg: pattern")?;
            let output = Command::new("grep")
                .args(["-r", "-n", "--include=*", pattern, root])
                .output()
                .map_err(|e| format!("grep failed: {}", e))?;
            let result = String::from_utf8_lossy(&output.stdout);
            if result.trim().is_empty() {
                Ok("No matches found".to_string())
            } else {
                let truncated: String = result.chars().take(5_000).collect();
                Ok(truncated)
            }
        }

        _ => Err(format!("Unknown tool: {}", name)),
    }
}
