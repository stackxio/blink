use std::fs;
use std::path::PathBuf;

use super::config::BlinkSettings;

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("blink");
        Self {
            path: config_dir.join("settings.json"),
        }
    }

    pub fn load(&self) -> anyhow::Result<BlinkSettings> {
        if !self.path.exists() {
            return Ok(BlinkSettings::default());
        }
        let contents = fs::read_to_string(&self.path)?;
        let settings: BlinkSettings = serde_json::from_str(&contents)?;
        Ok(settings)
    }

    pub fn save(&self, settings: &BlinkSettings) -> anyhow::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(settings)?;
        fs::write(&self.path, json)?;
        Ok(())
    }
}
