import { useState } from "react";
import { type Theme, getStoredTheme, changeTheme } from "@/lib/theme";

export default function SettingsAppearance() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  function handleThemeChange(t: Theme) {
    setTheme(t);
    changeTheme(t);
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
            <div className="settings-row__label">Font size</div>
            <div className="settings-row__hint">Adjust the UI font size</div>
          </div>
          <span className="settings-row__value">13px</span>
        </div>
      </div>
    </div>
  );
}
