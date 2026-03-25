import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type Theme, getStoredTheme, changeTheme } from "@/lib/theme";

const FONT_FAMILIES = [
  { value: "default", label: "System Default" },
  { value: "'SF Mono', 'Menlo', 'Monaco', monospace", label: "SF Mono" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'Fira Code', monospace", label: "Fira Code" },
  { value: "'Source Code Pro', monospace", label: "Source Code Pro" },
  { value: "'Cascadia Code', monospace", label: "Cascadia Code" },
  { value: "'IBM Plex Mono', monospace", label: "IBM Plex Mono" },
];

interface Settings {
  appearance: { theme: string; font_family: string };
  [key: string]: unknown;
}

export default function SettingsAppearance() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [fontFamily, setFontFamily] = useState("default");
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    invoke<Settings>("get_settings")
      .then((s) => {
        setSettings(s);
        setFontFamily(s.appearance.font_family);
      })
      .catch(() => {});
  }, []);

  async function handleThemeChange(t: Theme) {
    setTheme(t);
    changeTheme(t);
    if (!settings) return;
    const updated = { ...settings, appearance: { ...settings.appearance, theme: t } };
    setSettings(updated);
    invoke("save_settings", { settings: updated }).catch(() => {});
  }

  async function handleFontChange(value: string) {
    setFontFamily(value);
    if (!settings) return;
    const updated = { ...settings, appearance: { ...settings.appearance, font_family: value } };
    setSettings(updated);
    invoke("save_settings", { settings: updated }).catch(() => {});
  }

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">Appearance</h1>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Theme</div>
            <div className="settings-row__hint">Choose your preferred theme</div>
          </div>
          <div className="segment-control">
            {(["light", "dark", "system"] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`segment-control__item ${theme === t ? "segment-control__item--active" : ""}`}
                onClick={() => handleThemeChange(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Editor font family</div>
            <div className="settings-row__hint">Font used in the code editor</div>
          </div>
          <select
            className="input input--sm"
            value={fontFamily}
            onChange={(e) => handleFontChange(e.target.value)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
