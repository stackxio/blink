use std::fs;
use std::path::PathBuf;

use super::config::CaretSettings;

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("caret");
        Self {
            path: config_dir.join("settings.json"),
        }
    }

    pub fn load(&self) -> anyhow::Result<CaretSettings> {
        if !self.path.exists() {
            return Ok(CaretSettings::default());
        }
        let contents = fs::read_to_string(&self.path)?;
        let settings: CaretSettings = serde_json::from_str(&contents)?;
        Ok(settings)
    }

    pub fn save(&self, settings: &CaretSettings) -> anyhow::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(settings)?;
        fs::write(&self.path, json)?;
        Ok(())
    }
}
