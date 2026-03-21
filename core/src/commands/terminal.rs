use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

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

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let shell_name = shell.rsplit('/').next().unwrap_or("zsh");
    let mut cmd = CommandBuilder::new(&shell);

    // zsh: disable prompt percent escape that can cause rendering issues
    if shell_name == "zsh" {
        cmd.args(&["-o", "nopromptsp"]);
    }

    // Set TERM so the shell knows xterm capabilities
    cmd.env("TERM", "xterm-256color");

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
    session.writer.flush().map_err(|e| format!("Flush failed: {}", e))?;
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
