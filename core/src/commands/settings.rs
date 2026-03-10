use crate::settings::config::CaretSettings;
use crate::settings::store::SettingsStore;

#[tauri::command]
pub fn get_settings() -> Result<CaretSettings, String> {
    let store = SettingsStore::new();
    store.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(settings: CaretSettings) -> Result<(), String> {
    let store = SettingsStore::new();
    store.save(&settings).map_err(|e| e.to_string())
}
