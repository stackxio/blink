/// Virtual terminal backend using `vt100` for VT/ANSI processing.
///
/// Unlike the raw `terminal.rs` (which sends raw bytes to xterm.js), this
/// module maintains a terminal grid in Rust and emits structured frame events.
/// The JS side renders those frames on a plain `<canvas>`, eliminating all
/// xterm.js WebGL compositing artifacts.
use base64::{engine::general_purpose::STANDARD, Engine};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

// ── Color palette (matching TerminalInstance.tsx theme) ──────────────────────

fn idx_to_rgb(i: u8) -> [u8; 3] {
    match i {
        0 => [0x1e, 0x1e, 0x1e],
        1 => [0xf4, 0x47, 0x47],
        2 => [0x6a, 0x99, 0x55],
        3 => [0xd7, 0xba, 0x7d],
        4 => [0x56, 0x9c, 0xd6],
        5 => [0xc5, 0x86, 0xc0],
        6 => [0x4e, 0xc9, 0xb0],
        7 => [0xd4, 0xd4, 0xd4],
        8 => [0x80, 0x80, 0x80],
        9 => [0xf4, 0x47, 0x47],
        10 => [0x6a, 0x99, 0x55],
        11 => [0xd7, 0xba, 0x7d],
        12 => [0x56, 0x9c, 0xd6],
        13 => [0xc5, 0x86, 0xc0],
        14 => [0x4e, 0xc9, 0xb0],
        15 => [0xff, 0xff, 0xff],
        16..=231 => {
            let idx = i as usize - 16;
            let b = idx % 6;
            let g = (idx / 6) % 6;
            let r = idx / 36;
            let v = |x: usize| if x == 0 { 0u8 } else { (55 + x * 40) as u8 };
            [v(r), v(g), v(b)]
        }
        _ => {
            // 232–255: grayscale ramp
            let v = (8 + (i as usize - 232) * 10) as u8;
            [v, v, v]
        }
    }
}

fn resolve_color(color: vt100::Color, is_fg: bool) -> [u8; 3] {
    match color {
        vt100::Color::Default => {
            if is_fg {
                [0xd4, 0xd4, 0xd4]
            } else {
                [0x1e, 0x1e, 0x1e]
            }
        }
        vt100::Color::Idx(i) => idx_to_rgb(i),
        vt100::Color::Rgb(r, g, b) => [r, g, b],
    }
}

// ── Frame serialisation ───────────────────────────────────────────────────────
//
// Binary format sent as a base64 string to the JS renderer.
//
// Header (8 bytes):
//   u16 LE : cols
//   u16 LE : rows
//   u16 LE : cursor_x
//   u16 LE : cursor_y
//
// Per-cell block (10 bytes, row-major):
//   u32 LE : Unicode code point  (0x20 = space / empty)
//   u8     : fg_r
//   u8     : fg_g
//   u8     : fg_b
//   u8     : bg_r
//   u8     : bg_g
//   u8     : bg_b
//   u8     : flags   (bit0=bold bit1=italic bit2=underline bit3=inverse bit4=dim bit5=wide)
//   u8     : cursor  (1 if this cell is the cursor position)

const CELL_BYTES: usize = 10;
const HEADER_BYTES: usize = 8;

#[derive(Clone, Serialize)]
pub struct VTermFrame {
    /// Base64-encoded binary frame (header + cell blocks).
    pub data: String,
}

fn build_frame(parser: &vt100::Parser) -> VTermFrame {
    let screen = parser.screen();
    let rows = screen.size().0 as usize;
    let cols = screen.size().1 as usize;
    let (cur_row, cur_col) = screen.cursor_position();

    let mut buf = Vec::with_capacity(HEADER_BYTES + rows * cols * CELL_BYTES);

    // Header
    buf.extend_from_slice(&(cols as u16).to_le_bytes());
    buf.extend_from_slice(&(rows as u16).to_le_bytes());
    buf.extend_from_slice(&(cur_col as u16).to_le_bytes());
    buf.extend_from_slice(&(cur_row as u16).to_le_bytes());

    // Cells
    for row in 0..rows {
        for col in 0..cols {
            let cell = screen.cell(row as u16, col as u16);

            let (cp, fg, bg, flags) = match cell {
                None => (0x20u32, [0xd4u8, 0xd4, 0xd4], [0x1eu8, 0x1e, 0x1e], 0u8),
                Some(c) => {
                    let ch = c.contents();
                    let cp = ch.chars().next().unwrap_or(' ') as u32;
                    let fg = resolve_color(c.fgcolor(), true);
                    let bg = resolve_color(c.bgcolor(), false);
                    let mut flags = 0u8;
                    if c.bold() {
                        flags |= 1;
                    }
                    if c.italic() {
                        flags |= 2;
                    }
                    if c.underline() {
                        flags |= 4;
                    }
                    if c.inverse() {
                        flags |= 8;
                    }
                    if c.is_wide() {
                        flags |= 32;
                    }
                    (cp, fg, bg, flags)
                }
            };

            let is_cursor = (row as u16 == cur_row && col as u16 == cur_col) as u8;

            buf.extend_from_slice(&cp.to_le_bytes());
            buf.extend_from_slice(&fg);
            buf.extend_from_slice(&bg);
            buf.push(flags);
            buf.push(is_cursor);
        }
    }

    VTermFrame {
        data: STANDARD.encode(&buf),
    }
}

// ── Session management ────────────────────────────────────────────────────────

struct VTermSession {
    parser: Arc<Mutex<vt100::Parser>>,
    writer: Box<dyn Write + Send>,
    _master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct VTermManager {
    sessions: HashMap<String, VTermSession>,
}

impl VTermManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}

pub type VTermState = Arc<Mutex<VTermManager>>;

pub fn create_vterm_state() -> VTermState {
    Arc::new(Mutex::new(VTermManager::new()))
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Resolves the user's login-shell PATH (shared with terminal.rs logic).
fn login_shell_path() -> Option<String> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Option<String>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let try_run = |args: &[&str]| -> Option<String> {
                std::process::Command::new(&shell)
                    .args(args)
                    .stdin(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .output()
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            };
            try_run(&["-i", "-l", "-c", "echo $PATH"])
                .or_else(|| try_run(&["-l", "-c", "echo $PATH"]))
        })
        .clone()
}

#[tauri::command]
pub async fn vterm_create(
    app: AppHandle,
    state: tauri::State<'_, VTermState>,
    id: String,
    cwd: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
    command: Option<Vec<String>>,
) -> Result<(), String> {
    let rows = rows.unwrap_or(24);
    let cols = cols.unwrap_or(80);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let expanded_path = login_shell_path();

    let mut cmd = if let Some(argv) = command {
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
        let sh = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut c = CommandBuilder::new(&sh);
        let shell_name = sh.rsplit('/').next().unwrap_or("zsh");
        if shell_name == "zsh" {
            c.args(&["-o", "nopromptsp"]);
        }
        c
    };

    cmd.env("TERM", "xterm-256color");
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
        .map_err(|e| format!("Failed to spawn command: {e}"))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {e}"))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {e}"))?;

    // vt100::Parser owns the terminal grid state.
    let parser = Arc::new(Mutex::new(vt100::Parser::new(rows, cols, 0)));

    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.sessions.insert(
            id.clone(),
            VTermSession {
                parser: Arc::clone(&parser),
                writer,
                _master: pair.master,
            },
        );
    }

    // Reader thread: process PTY bytes through vt100, emit frame events.
    let event_name = format!("vterm:frame:{id}");
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut p) = parser.lock() {
                        p.process(&buf[..n]);
                        let frame = build_frame(&p);
                        let _ = app.emit(&event_name, frame);
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn vterm_write(
    state: tauri::State<'_, VTermState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr
        .sessions
        .get_mut(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write failed: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Flush failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn vterm_resize(
    app: AppHandle,
    state: tauri::State<'_, VTermState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr
        .sessions
        .get(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;

    // Resize the PTY
    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("PTY resize failed: {e}"))?;

    // Resize the vt100 parser grid and emit updated frame
    if let Ok(mut p) = session.parser.lock() {
        p.set_size(rows, cols);
        let frame = build_frame(&p);
        let _ = app.emit(&format!("vterm:frame:{id}"), frame);
    }

    Ok(())
}

#[tauri::command]
pub async fn vterm_close(
    state: tauri::State<'_, VTermState>,
    id: String,
) -> Result<(), String> {
    let mut mgr = state.lock().map_err(|e| e.to_string())?;
    mgr.sessions.remove(&id);
    Ok(())
}

/// Return the current frame snapshot on demand (e.g. when a tab becomes visible).
#[tauri::command]
pub async fn vterm_snapshot(
    app: AppHandle,
    state: tauri::State<'_, VTermState>,
    id: String,
) -> Result<(), String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr
        .sessions
        .get(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;
    if let Ok(p) = session.parser.lock() {
        let frame = build_frame(&p);
        let _ = app.emit(&format!("vterm:frame:{id}"), frame);
    }
    Ok(())
}
