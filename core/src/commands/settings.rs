use crate::settings::config::BlinkSettings;
use crate::settings::store::SettingsStore;

#[tauri::command]
pub fn get_settings() -> Result<BlinkSettings, String> {
    let store = SettingsStore::new();
    store.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(settings: BlinkSettings) -> Result<(), String> {
    let store = SettingsStore::new();
    store.save(&settings).map_err(|e| e.to_string())
}
