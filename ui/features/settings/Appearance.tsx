import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Upload, X, Download } from "lucide-react";
import {
  type Theme,
  getStoredTheme,
  changeTheme,
  applyCustomTheme,
  clearCustomTheme,
  getCustomTheme,
} from "@/lib/theme";
import { importVscodeThemeFile } from "@/lib/vscode-theme-import";
import { BLINK_THEME_SCHEMA, type BlinkTheme } from "@/lib/theme-schema";

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
  const [customTheme, setCustomTheme] = useState<BlinkTheme | null>(getCustomTheme);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleImportVscode(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await importVscodeThemeFile(file);
    if (!result.ok) {
      setImportError(result.error);
    } else {
      applyCustomTheme(result.theme);
      setCustomTheme(result.theme);
      setTheme(result.theme.type);
    }
    // Reset input so same file can be re-imported
    e.target.value = "";
  }

  function handleClearCustomTheme() {
    clearCustomTheme();
    setCustomTheme(null);
  }

  function handleDownloadSchema() {
    const blob = new Blob([JSON.stringify(BLINK_THEME_SCHEMA, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blink-theme.schema.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">Appearance</h1>

      {/* Base theme */}
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Theme</div>
            <div className="settings-row__hint">Choose your preferred color scheme</div>
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

        {/* Editor font */}
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
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom theme */}
      <div className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__title">Custom Theme</span>
          <button
            type="button"
            className="settings-card__action"
            onClick={handleDownloadSchema}
            title="Download theme JSON schema"
          >
            <Download size={13} />
            Schema
          </button>
        </div>

        {customTheme ? (
          <div className="settings-row">
            <div className="settings-row__info">
              <div className="settings-row__label">{customTheme.name}</div>
              <div className="settings-row__hint">{customTheme.type} · custom theme active</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} />
                Replace
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={handleClearCustomTheme}
                title="Remove custom theme"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-row">
            <div className="settings-row__info">
              <div className="settings-row__label">Import VS Code theme</div>
              <div className="settings-row__hint">
                Drop a VS Code <code>.json</code> color theme file to apply its colors
              </div>
            </div>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={13} />
              Import…
            </button>
          </div>
        )}

        {importError && <div className="settings-row__error">{importError}</div>}

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleImportVscode}
        />
      </div>
    </div>
  );
}
