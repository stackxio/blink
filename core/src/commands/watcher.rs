use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub struct WatcherState {
    handle: Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self { handle: None }
    }
}

#[tauri::command]
pub fn start_watching(app: AppHandle, path: String) -> Result<(), String> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| e.to_string())?;

    // Stop any existing watcher
    guard.handle = None;

    let emitter = app.clone();
    let debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = result {
                for event in events {
                    if event.kind == DebouncedEventKind::Any {
                        let file_path = event.path.to_string_lossy().to_string();
                        let _ = emitter.emit("file:changed", file_path);
                    }
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    guard.handle = Some(debouncer);

    // Start watching the path recursively
    if let Some(ref mut debouncer) = guard.handle {
        debouncer
            .watcher()
            .watch(
                std::path::Path::new(&path),
                notify::RecursiveMode::Recursive,
            )
            .map_err(|e| e.to_string())?;
    }

    log::info!("Started watching: {}", path);
    Ok(())
}

#[tauri::command]
pub fn stop_watching(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.handle = None;
    log::info!("Stopped file watcher");
    Ok(())
}
