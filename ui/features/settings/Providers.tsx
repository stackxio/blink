import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveBlinkCodeConfig, loadBlinkCodeConfig } from "@@/panel/config";

interface Settings {
  active_provider: string;
  ollama: { endpoint: string; model: string };
  custom: { endpoint: string; model: string; api_key: string };
  [key: string]: unknown;
}

export default function SettingsProviders() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

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

  function setActiveProvider(provider: string) {
    if (!settings) return;
    const updated = { ...settings, active_provider: provider };
    save(updated);
    syncToBlinkCodeConfig(updated);
  }

  function setOllama(patch: Partial<Settings["ollama"]>) {
    if (!settings) return;
    const updated = { ...settings, ollama: { ...settings.ollama, ...patch } };
    save(updated);
    // Sync to BlinkCodePanel config so the AI chat panel uses the same endpoint/model
    if (updated.active_provider === "ollama") {
      syncToBlinkCodeConfig(updated);
    }
  }

  function setCustom(patch: Partial<Settings["custom"]>) {
    if (!settings) return;
    const updated = { ...settings, custom: { ...settings.custom, ...patch } };
    save(updated);
    if (updated.active_provider === "custom") {
      syncToBlinkCodeConfig(updated);
    }
  }

  function syncToBlinkCodeConfig(s: Settings) {
    const existing = loadBlinkCodeConfig();
    if (s.active_provider === "ollama") {
      saveBlinkCodeConfig({
        ...existing,
        provider: {
          type: "openai-compat",
          baseUrl: s.ollama.endpoint ? `${s.ollama.endpoint}/v1` : "http://localhost:11434/v1",
          model: s.ollama.model,
          apiKey: "ollama",
        },
      });
    } else if (s.active_provider === "custom") {
      saveBlinkCodeConfig({
        ...existing,
        provider: {
          type: "openai-compat",
          baseUrl: s.custom.endpoint,
          model: s.custom.model,
          apiKey: s.custom.api_key || undefined,
        },
      });
    }
  }

  async function fetchOllamaModels() {
    if (!settings?.ollama.endpoint) return;
    setFetchingModels(true);
    try {
      const resp = await fetch(`${settings.ollama.endpoint}/api/tags`);
      const data = await resp.json() as { models?: Array<{ name: string }> };
      const models = (data.models ?? []).map((m) => m.name);
      setOllamaModels(models);
      if (models.length > 0 && !settings.ollama.model) {
        setOllama({ model: models[0] });
      }
    } catch {
      // Ollama not running or unreachable
    } finally {
      setFetchingModels(false);
    }
  }

  if (!settings) return null;

  const isOllamaActive = settings.active_provider === "ollama";
  const isCustomActive = settings.active_provider === "custom";

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">AI Providers</h1>
      <p className="settings-section__description">
        Configure the provider used by the built-in AI chat. CLI agents (Claude, Codex, Gemini) are
        configured in the AI panel.
      </p>

      {/* Ollama */}
      <div
        className="settings-card settings-card--spaced"
        style={
          isOllamaActive
            ? { borderColor: "var(--c-success)", boxShadow: "0 0 0 1px var(--c-success)" }
            : undefined
        }
      >
        <button
          type="button"
          className="settings-row"
          style={{
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onClick={() => setActiveProvider("ollama")}
        >
          <div className="settings-row__info">
            <div className="settings-row__label">
              <span
                className={`settings-row__status-dot${isOllamaActive ? " settings-row__status-dot--active" : ""}`}
              />
              Ollama
            </div>
            <div className="settings-row__hint">Connect to a local Ollama server</div>
          </div>
          <span
            className="settings-row__value"
            style={
              isOllamaActive
                ? {
                    color: "var(--c-success)",
                    borderColor: "var(--c-success)",
                    background: "color-mix(in srgb, var(--c-success) 10%, transparent)",
                  }
                : undefined
            }
          >
            {isOllamaActive ? "ACTIVE" : "SET ACTIVE"}
          </span>
        </button>

        {isOllamaActive && (
          <div
            className="settings-row settings-row--col"
            style={{ borderTop: "1px solid var(--c-border)" }}
          >
            <div className="settings-row__inputs" style={{ width: "100%" }}>
              <input
                type="text"
                className="input input--sm"
                placeholder="http://localhost:11434"
                value={settings.ollama.endpoint}
                onChange={(e) => setOllama({ endpoint: e.target.value })}
                style={{ flex: 1, minWidth: 180 }}
              />
              {ollamaModels.length > 0 ? (
                <select
                  className="input input--sm"
                  value={settings.ollama.model}
                  onChange={(e) => setOllama({ model: e.target.value })}
                  style={{ flex: 1, minWidth: 140 }}
                >
                  {ollamaModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="input input--sm"
                  placeholder="Model (e.g. llama3)"
                  value={settings.ollama.model}
                  onChange={(e) => setOllama({ model: e.target.value })}
                  style={{ flex: 1, minWidth: 140 }}
                />
              )}
              <button
                type="button"
                className="btn btn--default btn--sm"
                onClick={fetchOllamaModels}
                disabled={fetchingModels || !settings.ollama.endpoint}
                title="Fetch available models from Ollama"
              >
                {fetchingModels ? "…" : "Fetch models"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Custom API */}
      <div
        className="settings-card"
        style={
          isCustomActive
            ? { borderColor: "var(--c-success)", boxShadow: "0 0 0 1px var(--c-success)" }
            : undefined
        }
      >
        <button
          type="button"
          className="settings-row"
          style={{
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onClick={() => setActiveProvider("custom")}
        >
          <div className="settings-row__info">
            <div className="settings-row__label">
              <span
                className={`settings-row__status-dot${isCustomActive ? " settings-row__status-dot--active" : ""}`}
              />
              Custom API
            </div>
            <div className="settings-row__hint">Any OpenAI-compatible endpoint</div>
          </div>
          <span
            className="settings-row__value"
            style={
              isCustomActive
                ? {
                    color: "var(--c-success)",
                    borderColor: "var(--c-success)",
                    background: "color-mix(in srgb, var(--c-success) 10%, transparent)",
                  }
                : undefined
            }
          >
            {isCustomActive ? "ACTIVE" : "SET ACTIVE"}
          </span>
        </button>

        {isCustomActive && (
          <div
            className="settings-row settings-row--col"
            style={{ borderTop: "1px solid var(--c-border)" }}
          >
            <input
              type="text"
              className="input input--sm"
              placeholder="Endpoint URL"
              value={settings.custom.endpoint}
              onChange={(e) => setCustom({ endpoint: e.target.value })}
              style={{ width: "100%" }}
            />
            <div className="settings-row__inputs" style={{ width: "100%" }}>
              <input
                type="text"
                className="input input--sm"
                placeholder="Model"
                value={settings.custom.model}
                onChange={(e) => setCustom({ model: e.target.value })}
                style={{ flex: 1, minWidth: 140 }}
              />
              <input
                type="password"
                className="input input--sm"
                placeholder="API key (optional)"
                value={settings.custom.api_key}
                onChange={(e) => setCustom({ api_key: e.target.value })}
                style={{ flex: 1, minWidth: 160 }}
              />
            </div>
          </div>
        )}
      </div>

      {saved && (
        <p
          style={{
            marginTop: 12,
            fontSize: "var(--font-size-xs)",
            color: "var(--c-muted-fg)",
          }}
        >
          Saved.
        </p>
      )}
    </div>
  );
}
