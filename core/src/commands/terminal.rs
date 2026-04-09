use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// Resolve the full user PATH by sourcing the login shell.
/// macOS .app bundles inherit a stripped PATH (/usr/bin:/bin:…) from launchd,
/// which misses Homebrew, nvm, npm globals, etc.  Running the shell with
/// `-i -l -c` gives us the same PATH the user sees in their terminal.
///
/// IMPORTANT: `-i` is required.  Most zsh users put their `export PATH=…`
/// lines in `~/.zshrc`, which is only sourced in interactive mode.
/// Running `zsh -l -c` alone only sources `.zprofile`/`.zlogin` and misses
/// `.zshrc` entirely — that's why binaries installed via nvm, cmux, or
/// `~/.local/bin` don't show up inside a .app bundle.
///
/// Cached in a OnceLock so we don't spawn a shell on every agent check.
fn login_shell_path() -> Option<String> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Option<String>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let try_run = |args: &[&str]| -> Option<String> {
                std::process::Command::new(&shell)
                    .args(args)
                    // Redirect stdin from /dev/null to prevent any interactive
                    // prompts from hanging the shell.
                    .stdin(std::process::Stdio::null())
                    // Swallow stderr so any startup noise (job notifications,
                    // rc-file warnings) doesn't pollute the captured PATH.
                    .stderr(std::process::Stdio::null())
                    .output()
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            };
            // Prefer -i -l -c (interactive + login): sources .zshrc as well,
            // catching PATH exports that the user typed into their rc file.
            // Fall back to -l -c if -i fails for some reason.
            try_run(&["-i", "-l", "-c", "echo $PATH"])
                .or_else(|| try_run(&["-l", "-c", "echo $PATH"]))
        })
        .clone()
}

struct TerminalSession {
    writer: Box<dyn Write + Send>,
    // master_pty kept alive to prevent EOF
    _master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct TerminalManager {
    sessions: HashMap<String, TerminalSession>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}

pub type TerminalState = Arc<Mutex<TerminalManager>>;

pub fn create_terminal_state() -> TerminalState {
    Arc::new(Mutex::new(TerminalManager::new()))
}

#[tauri::command]
pub async fn terminal_create(
    app: AppHandle,
    state: tauri::State<'_, TerminalState>,
    id: String,
    cwd: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
    shell: Option<String>,
    command: Option<Vec<String>>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Expand PATH via the user's login shell so tools installed through Homebrew,
    // nvm, npm globals, etc. are reachable even inside a .app bundle.
    let expanded_path = login_shell_path();

    let mut cmd = if let Some(argv) = command {
        // Run a specific command directly (e.g. claude --dangerously-skip-permissions)
        let exe = argv
            .first()
            .cloned()
            .unwrap_or_else(|| "/bin/zsh".to_string());
        let mut c = CommandBuilder::new(&exe);
        for arg in argv.iter().skip(1) {
            c.arg(arg);
        }
        c
    } else {
        // Regular interactive shell
        let sh = shell
            .unwrap_or_else(|| std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string()));
        let shell_name = sh.rsplit('/').next().unwrap_or("zsh");
        let mut c = CommandBuilder::new(&sh);
        if shell_name == "zsh" {
            c.args(&["-o", "nopromptsp"]);
        }
        c
    };

    // Set TERM so the shell knows xterm capabilities
    cmd.env("TERM", "xterm-256color");

    // Inject expanded PATH so agent binaries can be found
    if let Some(path) = expanded_path {
        cmd.env("PATH", path);
    }

    if let Some(dir) = &cwd {
        cmd.cwd(dir);
    } else if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {}", e))?;

    // Store session
    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.sessions.insert(
            id.clone(),
            TerminalSession {
                writer,
                _master: pair.master,
            },
        );
    }

    // Background thread: read PTY output → emit per-terminal event
    let event_name = format!("terminal:output:{}", id);
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(&event_name, text);
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn terminal_write(
    state: tauri::State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr
        .sessions
        .get_mut(&id)
        .ok_or_else(|| format!("Terminal {} not found", id))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Flush failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr
        .sessions
        .get(&id)
        .ok_or_else(|| format!("Terminal {} not found", id))?;
    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_close(
    state: tauri::State<'_, TerminalState>,
    id: String,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.sessions.remove(&id);
    Ok(())
}

/// Is this path an existing file with an executable bit set?
fn is_executable_file(path: &std::path::Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return meta.permissions().mode() & 0o111 != 0;
    }
    #[cfg(not(unix))]
    true
}

/// Search the given `PATH` string (colon-separated on unix) for `name`.
/// Returns the first executable match found.  Implemented in pure Rust so we
/// don't depend on `/usr/bin/which` behavior, and so we can pick up binaries
/// that a shell function or alias is shadowing in the user's interactive shell.
fn search_path_dirs(name: &str, path_env: &str) -> Option<String> {
    for dir in path_env.split(':') {
        if dir.is_empty() {
            continue;
        }
        let candidate = std::path::PathBuf::from(dir).join(name);
        if is_executable_file(&candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// Well-known absolute install paths to check for each agent binary.
/// Used as a last-resort fallback when the expanded shell PATH doesn't
/// contain the binary (e.g. the user installed it into a dir that's only
/// referenced by a shell function wrapper).
fn known_install_paths(name: &str) -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    let home = dirs::home_dir();

    // Paths that apply to any agent — check obvious system locations first.
    let generic = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/usr/bin",
    ];
    for base in generic {
        paths.push(std::path::PathBuf::from(base).join(name));
    }

    // Agent-specific known install locations.
    if let Some(h) = &home {
        match name {
            "claude" => {
                // Claude Code's default self-install location.
                paths.push(h.join(".claude/local/claude"));
                paths.push(h.join(".local/bin/claude"));
            }
            "codex" => {
                paths.push(h.join(".codex/bin/codex"));
                paths.push(h.join(".local/bin/codex"));
            }
            "gemini" => {
                paths.push(h.join(".local/bin/gemini"));
            }
            "opencode" => {
                paths.push(h.join(".local/bin/opencode"));
                paths.push(h.join(".opencode/bin/opencode"));
            }
            _ => {
                paths.push(h.join(".local/bin").join(name));
            }
        }
    }

    paths
}

/// Resolve a single binary name to its absolute path on disk, trying
/// multiple strategies in order:
/// 1. Search the expanded login-shell PATH directly (pure Rust; bypasses
///    shell functions/aliases that may be shadowing the real binary).
/// 2. Fall back to `/usr/bin/which` with the expanded PATH.
/// 3. Fall back to a list of well-known install locations for the agent.
fn resolve_binary(name: &str, expanded_path: Option<&str>) -> Option<String> {
    // Strategy 1: search expanded PATH in pure Rust
    if let Some(path_env) = expanded_path {
        if let Some(found) = search_path_dirs(name, path_env) {
            return Some(found);
        }
    }

    // Strategy 2: delegate to /usr/bin/which in case PATH entries are strange
    let mut cmd = std::process::Command::new("/usr/bin/which");
    cmd.arg(name).stderr(std::process::Stdio::null());
    if let Some(path) = expanded_path {
        cmd.env("PATH", path);
    }
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                if let Some(first) = stdout.lines().next() {
                    let trimmed = first.trim();
                    if !trimmed.is_empty() && std::path::Path::new(trimmed).exists() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    // Strategy 3: check known install locations
    for candidate in known_install_paths(name) {
        if is_executable_file(&candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }

    None
}

/// Check which CLI binaries from the given list are available in PATH.
/// Returns a map of `name -> absolute binary path` for every binary found.
///
/// Uses the user's login-shell PATH so Homebrew/nvm/npm globals are visible
/// even when the app is launched as a .app bundle with launchd's stripped PATH.
///
/// The absolute path is returned so callers can spawn the binary directly,
/// bypassing any shell function wrappers the user may have in their rc files
/// (e.g. cmux's `claude() { "$_CMUX_CLAUDE_WRAPPER" "$@"; }`).
#[tauri::command]
pub async fn which_cli(names: Vec<String>) -> std::collections::HashMap<String, String> {
    let expanded_path = login_shell_path();
    let mut out = std::collections::HashMap::new();
    for name in names {
        if let Some(path) = resolve_binary(&name, expanded_path.as_deref()) {
            out.insert(name, path);
        }
    }
    out
}
