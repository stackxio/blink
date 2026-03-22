import { useState } from "react";
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

export default function SettingsAppearance() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [fontFamily, setFontFamily] = useState(
    () => localStorage.getItem("caret:fontFamily") || "default",
  );

  function handleThemeChange(t: Theme) {
    setTheme(t);
    changeTheme(t);
  }

  function handleFontChange(value: string) {
    setFontFamily(value);
    localStorage.setItem("caret:fontFamily", value);
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
