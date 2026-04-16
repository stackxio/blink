/// Virtual terminal backend using `vt100` for VT/ANSI processing.
///
/// Unlike the raw `terminal.rs` (which sends raw bytes to xterm.js), this
/// module maintains a terminal grid in Rust and emits structured frame events.
/// The JS side renders those frames on a plain `<canvas>`, eliminating all
/// xterm.js WebGL compositing artifacts.
use base64::{engine::general_purpose::STANDARD, Engine};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// ── Color palette ─────────────────────────────────────────────────────────────

fn idx_to_rgb(i: u8) -> [u8; 3] {
    match i {
        0  => [0x1e, 0x1e, 0x1e],
        1  => [0xf4, 0x47, 0x47],
        2  => [0x6a, 0x99, 0x55],
        3  => [0xd7, 0xba, 0x7d],
        4  => [0x56, 0x9c, 0xd6],
        5  => [0xc5, 0x86, 0xc0],
        6  => [0x4e, 0xc9, 0xb0],
        7  => [0xd4, 0xd4, 0xd4],
        8  => [0x80, 0x80, 0x80],
        9  => [0xf4, 0x47, 0x47],
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
            let v = (8 + (i as usize - 232) * 10) as u8;
            [v, v, v]
        }
    }
}

fn default_colors(dark: bool) -> ([u8; 3], [u8; 3]) {
    if dark {
        ([0xd4, 0xd4, 0xd4], [0x1e, 0x1e, 0x1e])
    } else {
        ([0x1e, 0x1e, 0x1e], [0xf5, 0xf5, 0xf5])
    }
}

fn resolve_color(
    color: vt100::Color,
    is_fg: bool,
    default_fg: [u8; 3],
    default_bg: [u8; 3],
) -> [u8; 3] {
    match color {
        vt100::Color::Default => if is_fg { default_fg } else { default_bg },
        vt100::Color::Idx(i)  => idx_to_rgb(i),
        vt100::Color::Rgb(r, g, b) => [r, g, b],
    }
}

// ── Frame serialisation ───────────────────────────────────────────────────────
//
// Header (8 bytes):
//   u16 LE : cols
//   u16 LE : rows
//   u16 LE : cursor_x  (0 when showing scrollback)
//   u16 LE : cursor_y  (0 when showing scrollback)
//
// Per-cell block (12 bytes, row-major):
//   u32 LE : Unicode code point
//   u8     : fg_r, fg_g, fg_b
//   u8     : bg_r, bg_g, bg_b
//   u8     : flags  (bit0=bold bit1=italic bit2=underline bit3=inverse bit4=wide)
//   u8     : cursor (1 if this is the cursor cell)

const CELL_BYTES: usize = 12;
const HEADER_BYTES: usize = 8;
/// How many rendered frames to keep in the scroll-back ring buffer.
/// Each frame = rows × cols × 12 bytes (+ 8-byte header).
/// For a 40×220 terminal that's ~103 KB per frame; 500 frames ≈ 50 MB worst-case,
/// but in practice terminals are smaller and frames are only stored on PTY output.
const MAX_FRAME_HISTORY: usize = 500;

#[derive(Clone, Serialize)]
pub struct VTermFrame {
    pub data: String,
}

/// Serialize one screen row into the packed cell format.
/// `is_live_row` controls whether cursor detection is active.
fn encode_screen_row(
    screen: &vt100::Screen,
    row: u16,
    cols: usize,
    cur_row: u16,
    cur_col: u16,
    show_cursor: bool,
    default_fg: [u8; 3],
    default_bg: [u8; 3],
    buf: &mut Vec<u8>,
) {
    for col in 0..cols as u16 {
        let cell = screen.cell(row, col);
        let is_cursor = show_cursor && row == cur_row && col == cur_col;
        let (cp, fg, bg, flags) = match cell {
            None => (0x20u32, default_fg, default_bg, 0u8),
            Some(c) => {
                let ch = c.contents();
                let cp = ch.chars().next().unwrap_or(' ') as u32;
                let fg = resolve_color(c.fgcolor(), true,  default_fg, default_bg);
                let bg = resolve_color(c.bgcolor(), false, default_fg, default_bg);
                let mut flags = 0u8;
                if c.bold()      { flags |= 1; }
                if c.italic()    { flags |= 2; }
                if c.underline() { flags |= 4; }
                if c.inverse()   { flags |= 8; }
                if c.is_wide()   { flags |= 32; }
                (cp, fg, bg, flags)
            }
        };
        buf.extend_from_slice(&cp.to_le_bytes());
        buf.extend_from_slice(&fg);
        buf.extend_from_slice(&bg);
        buf.push(flags);
        buf.push(is_cursor as u8);
    }
}

/// Build a live frame (scroll_offset == 0).
fn build_frame(parser: &vt100::Parser, dark: bool) -> VTermFrame {
    let (default_fg, default_bg) = default_colors(dark);
    let screen = parser.screen();
    let rows = screen.size().0 as usize;
    let cols = screen.size().1 as usize;
    let (cur_row, cur_col) = screen.cursor_position();

    let mut buf = Vec::with_capacity(HEADER_BYTES + rows * cols * CELL_BYTES);
    buf.extend_from_slice(&(cols as u16).to_le_bytes());
    buf.extend_from_slice(&(rows as u16).to_le_bytes());
    buf.extend_from_slice(&(cur_col as u16).to_le_bytes());
    buf.extend_from_slice(&(cur_row as u16).to_le_bytes());

    for row in 0..rows as u16 {
        encode_screen_row(
            &screen, row, cols,
            cur_row, cur_col, true,
            default_fg, default_bg, &mut buf,
        );
    }

    VTermFrame { data: STANDARD.encode(&buf) }
}

// ── Session management ────────────────────────────────────────────────────────

struct VTermSession {
    parser: Arc<Mutex<vt100::Parser>>,
    dark: Arc<AtomicBool>,
    /// Ring buffer of past rendered frames (raw binary bytes, incl. header).
    /// Oldest frame at index 0; most recent at the back.
    /// Only grows when the PTY produces output (reader thread is blocked otherwise).
    frame_history: Arc<Mutex<VecDeque<Vec<u8>>>>,
    /// 0 = live view; N = show the frame at history[len - N].
    scroll_offset: Arc<AtomicUsize>,
    writer: Box<dyn Write + Send>,
    _master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct VTermManager {
    sessions: HashMap<String, VTermSession>,
}

impl VTermManager {
    pub fn new() -> Self {
        Self { sessions: HashMap::new() }
    }
}

pub type VTermState = Arc<Mutex<VTermManager>>;

pub fn create_vterm_state() -> VTermState {
    Arc::new(Mutex::new(VTermManager::new()))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn login_shell_path() -> Option<String> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Option<String>> = OnceLock::new();
    CACHE.get_or_init(|| {
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
    }).clone()
}

/// Render the current screen to raw bytes (header + cells).
/// This is stored in the frame-history ring buffer for scroll-back replay.
fn build_frame_bytes(parser: &vt100::Parser, dark: bool) -> Vec<u8> {
    let (default_fg, default_bg) = default_colors(dark);
    let screen = parser.screen();
    let rows = screen.size().0 as usize;
    let cols = screen.size().1 as usize;
    let (cur_row, cur_col) = screen.cursor_position();

    let mut buf = Vec::with_capacity(HEADER_BYTES + rows * cols * CELL_BYTES);
    buf.extend_from_slice(&(cols as u16).to_le_bytes());
    buf.extend_from_slice(&(rows as u16).to_le_bytes());
    buf.extend_from_slice(&(cur_col as u16).to_le_bytes());
    buf.extend_from_slice(&(cur_row as u16).to_le_bytes());
    for row in 0..rows as u16 {
        encode_screen_row(&screen, row, cols, cur_row, cur_col, true,
            default_fg, default_bg, &mut buf);
    }
    buf
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn vterm_create(
    app: AppHandle,
    state: tauri::State<'_, VTermState>,
    id: String,
    cwd: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
    command: Option<Vec<String>>,
    // true (default) = dark theme; false = light theme
    dark: Option<bool>,
) -> Result<(), String> {
    let rows = rows.unwrap_or(24);
    let cols = cols.unwrap_or(80);
    let dark_mode = dark.unwrap_or(true);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let expanded_path = login_shell_path();

    let mut cmd = if let Some(argv) = command {
        let exe = argv.first().cloned().unwrap_or_else(|| "/bin/zsh".to_string());
        let mut c = CommandBuilder::new(&exe);
        for arg in argv.iter().skip(1) { c.arg(arg); }
        c
    } else {
        let sh = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut c = CommandBuilder::new(&sh);
        if sh.rsplit('/').next().unwrap_or("zsh") == "zsh" {
            c.args(&["-o", "nopromptsp"]);
        }
        c
    };

    cmd.env("TERM", "xterm-256color");
    if let Some(path) = expanded_path { cmd.env("PATH", path); }
    if let Some(dir) = &cwd { cmd.cwd(dir); }
    else if let Some(home) = dirs::home_dir() { cmd.cwd(home); }

    let _child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {e}"))?;

    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to get writer: {e}"))?;
    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {e}"))?;

    let parser        = Arc::new(Mutex::new(vt100::Parser::new(rows, cols, 0)));
    let dark_flag     = Arc::new(AtomicBool::new(dark_mode));
    let frame_history = Arc::new(Mutex::new(VecDeque::<Vec<u8>>::new()));
    let scroll_offset = Arc::new(AtomicUsize::new(0));

    {
        let mut mgr = state.lock().map_err(|e| e.to_string())?;
        mgr.sessions.insert(id.clone(), VTermSession {
            parser:        Arc::clone(&parser),
            dark:          Arc::clone(&dark_flag),
            frame_history: Arc::clone(&frame_history),
            scroll_offset: Arc::clone(&scroll_offset),
            writer,
            _master: pair.master,
        });
    }

    // Reader thread — processes PTY bytes, stores frames, emits events.
    let event_name = format!("vterm:frame:{id}");
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        // Throttle history snapshots: only store a frame every SAMPLE_INTERVAL.
        // Claude Code can emit 100s of PTY chunks per second; storing every one
        // would make the scrollback history so dense that a single trackpad swipe
        // would jump seconds worth of output.
        const SAMPLE_INTERVAL: Duration = Duration::from_millis(100);
        let mut last_snapshot = Instant::now().checked_sub(SAMPLE_INTERVAL * 2)
            .unwrap_or(Instant::now());

        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if let Ok(mut p) = parser.lock() {
                        let dark = dark_flag.load(Ordering::Relaxed);

                        p.process(&buf[..n]);

                        // Build the current frame bytes.
                        let frame_bytes = build_frame_bytes(&p, dark);

                        // Only snapshot into history every SAMPLE_INTERVAL so
                        // each scroll step represents a meaningful time window.
                        let now = Instant::now();
                        if now.duration_since(last_snapshot) >= SAMPLE_INTERVAL {
                            last_snapshot = now;
                            if let Ok(mut hist) = frame_history.lock() {
                                hist.push_back(frame_bytes.clone());
                                if hist.len() > MAX_FRAME_HISTORY {
                                    hist.pop_front();
                                }
                                let cur = scroll_offset.load(Ordering::Relaxed);
                                if cur > 0 {
                                    let new_off = (cur + 1).min(hist.len().saturating_sub(1));
                                    scroll_offset.store(new_off, Ordering::Relaxed);
                                }
                            }
                        }

                        // Emit the right frame to the canvas.
                        let so = scroll_offset.load(Ordering::Relaxed);
                        let frame = if so > 0 {
                            // Show a historical frame.
                            frame_history.lock().ok().and_then(|hist| {
                                let idx = hist.len().saturating_sub(1 + so);
                                hist.get(idx).map(|bytes| VTermFrame {
                                    data: STANDARD.encode(bytes),
                                })
                            }).unwrap_or_else(|| build_frame(&p, dark))
                        } else {
                            // Live view — already built above.
                            VTermFrame { data: STANDARD.encode(&frame_bytes) }
                        };
                        let _ = app.emit(&event_name, frame);
                    }
                }
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
    let session = mgr.sessions.get_mut(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;
    // Any key input returns to the live view
    session.scroll_offset.store(0, Ordering::Relaxed);
    session.writer.write_all(data.as_bytes())
        .map_err(|e| format!("Write failed: {e}"))?;
    session.writer.flush()
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
    let session = mgr.sessions.get(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;

    session._master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("PTY resize failed: {e}"))?;

    // Reset scroll on resize — cell dimensions changed so old frames are invalid.
    session.scroll_offset.store(0, Ordering::Relaxed);
    if let Ok(mut hist) = session.frame_history.lock() { hist.clear(); }

    let dark = session.dark.load(Ordering::Relaxed);
    if let Ok(mut p) = session.parser.lock() {
        p.set_size(rows, cols);
        let frame = build_frame(&p, dark);
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

#[tauri::command]
pub async fn vterm_snapshot(
    app: AppHandle,
    state: tauri::State<'_, VTermState>,
    id: String,
) -> Result<(), String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr.sessions.get(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;
    let dark = session.dark.load(Ordering::Relaxed);
    let so   = session.scroll_offset.load(Ordering::Relaxed);
    let frame = if so > 0 {
        session.frame_history.lock().ok().and_then(|hist| {
            let idx = hist.len().saturating_sub(1 + so);
            hist.get(idx).map(|bytes| VTermFrame { data: STANDARD.encode(bytes) })
        })
    } else {
        None
    };
    let frame = frame.unwrap_or_else(|| {
        session.parser.lock().ok()
            .map(|p| build_frame(&p, dark))
            .unwrap_or(VTermFrame { data: String::new() })
    });
    let _ = app.emit(&format!("vterm:frame:{id}"), frame);
    Ok(())
}

/// Scroll the terminal view.
///
/// `delta` > 0 = scroll up (older content / more frames back).
/// `delta` < 0 = scroll down (newer content / back toward live).
/// `delta` = i32::MIN snaps immediately back to live.
///
/// `delta` is in "scroll steps" — each step moves 1 frame in history.
/// The TypeScript side converts wheel `deltaY` to steps before calling this.
#[tauri::command]
pub async fn vterm_scroll(
    app: AppHandle,
    state: tauri::State<'_, VTermState>,
    id: String,
    delta: i32,
) -> Result<(), String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr.sessions.get(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;

    let hist_len = session.frame_history.lock().map(|h| h.len()).unwrap_or(0);
    let current  = session.scroll_offset.load(Ordering::Relaxed);
    // Keep offset in [0, hist_len - 1] so index (hist_len - 1 - offset) is always valid.
    let max_off  = hist_len.saturating_sub(1);

    let new_offset = if delta == i32::MIN {
        0
    } else if delta > 0 {
        (current + delta as usize).min(max_off)
    } else {
        current.saturating_sub((-delta) as usize)
    };

    session.scroll_offset.store(new_offset, Ordering::Relaxed);

    let dark = session.dark.load(Ordering::Relaxed);
    let frame = if new_offset > 0 {
        session.frame_history.lock().ok().and_then(|hist| {
            let idx = hist.len().saturating_sub(1 + new_offset);
            hist.get(idx).map(|bytes| VTermFrame { data: STANDARD.encode(bytes) })
        })
    } else {
        None
    };
    let frame = frame.unwrap_or_else(|| {
        session.parser.lock().ok()
            .map(|p| build_frame(&p, dark))
            .unwrap_or(VTermFrame { data: String::new() })
    });
    let _ = app.emit(&format!("vterm:frame:{id}"), frame);
    Ok(())
}

/// Live theme switch — re-emits the current frame with updated default colors.
#[tauri::command]
pub async fn vterm_set_colors(
    app: AppHandle,
    state: tauri::State<'_, VTermState>,
    id: String,
    dark: bool,
) -> Result<(), String> {
    let mgr = state.lock().map_err(|e| e.to_string())?;
    let session = mgr.sessions.get(&id)
        .ok_or_else(|| format!("VTerm {id} not found"))?;
    session.dark.store(dark, Ordering::Relaxed);
    if let Ok(p) = session.parser.lock() {
        let frame = build_frame(&p, dark);
        let _ = app.emit(&format!("vterm:frame:{id}"), frame);
    }
    Ok(())
}
