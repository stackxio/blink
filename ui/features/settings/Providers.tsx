import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Settings {
  active_provider: string;
  codex: { model: string };
  ollama: { endpoint: string; model: string };
  custom: { endpoint: string; model: string; api_key: string };
  [key: string]: unknown;
}

export default function SettingsProviders() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<Settings>("get_settings")
      .then(setSettings)
      .catch(() => {});
  }, []);

  async function save(updated: Settings) {
    setSettings(updated);
    try {
      await invoke("save_settings", { settings: updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // non-critical
    }
  }

  function setOllama(patch: Partial<Settings["ollama"]>) {
    if (!settings) return;
    save({ ...settings, ollama: { ...settings.ollama, ...patch } });
  }

  function setCustom(patch: Partial<Settings["custom"]>) {
    if (!settings) return;
    save({ ...settings, custom: { ...settings.custom, ...patch } });
  }

  if (!settings) return null;

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">AI Providers</h1>

      {/* Codex */}
      <div className="settings-card settings-card--spaced">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">
              <span className="settings-row__status-dot settings-row__status-dot--active" />
              Codex
            </div>
            <div className="settings-row__hint">Uses the locally installed Codex CLI</div>
          </div>
          <span className="settings-row__value">DEFAULT</span>
        </div>
      </div>

      {/* Ollama */}
      <div className="settings-card settings-card--spaced">
        <div className="settings-row settings-row--stacked">
          <div>
            <div className="settings-row__label">
              <span className="settings-row__status-dot" />
              Ollama
            </div>
            <div className="settings-row__hint">Connect to a local Ollama server</div>
          </div>
          <div className="settings-row__inputs">
            <input
              type="text"
              className="input input--sm"
              placeholder="http://localhost:11434"
              value={settings.ollama.endpoint}
              onChange={(e) => setOllama({ endpoint: e.target.value })}
            />
            <input
              type="text"
              className="input input--sm settings-row__input--narrow"
              placeholder="Model (e.g. llama3)"
              value={settings.ollama.model}
              onChange={(e) => setOllama({ model: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Custom API */}
      <div className="settings-card">
        <div className="settings-row settings-row--stacked">
          <div>
            <div className="settings-row__label">
              <span className="settings-row__status-dot" />
              Custom API
            </div>
            <div className="settings-row__hint">Any OpenAI-compatible endpoint</div>
          </div>
          <input
            type="text"
            className="input input--sm"
            placeholder="Endpoint URL"
            value={settings.custom.endpoint}
            onChange={(e) => setCustom({ endpoint: e.target.value })}
          />
          <div className="settings-row__inputs">
            <input
              type="text"
              className="input input--sm"
              placeholder="Model"
              value={settings.custom.model}
              onChange={(e) => setCustom({ model: e.target.value })}
            />
            <input
              type="password"
              className="input input--sm"
              placeholder="API key (optional)"
              value={settings.custom.api_key}
              onChange={(e) => setCustom({ api_key: e.target.value })}
            />
          </div>
        </div>
      </div>

      {saved && (
        <p style={{ marginTop: 12, fontSize: "var(--font-size-xs)", color: "var(--c-muted-fg)" }}>
          Saved.
        </p>
      )}
    </div>
  );
}
