export default function SettingsProviders() {
  return (
    <div className="settings-section">
      <h1 className="settings-section__title">AI Providers</h1>

      <div className="settings-card" style={{ marginBottom: 12 }}>
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--c-success)", display: "inline-block" }} />
              Codex
            </div>
            <div className="settings-row__hint">Uses the locally installed Codex CLI</div>
          </div>
          <span className="settings-row__value">DEFAULT</span>
        </div>
      </div>

      <div className="settings-card" style={{ marginBottom: 12 }}>
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div>
            <div className="settings-row__label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--c-muted)", display: "inline-block" }} />
              Ollama
            </div>
            <div className="settings-row__hint">Connect to a local Ollama server</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" className="input input--sm" placeholder="http://localhost:11434" style={{ flex: 1 }} />
            <input type="text" className="input input--sm" placeholder="Model (e.g. llama3)" style={{ width: 140 }} />
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div>
            <div className="settings-row__label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--c-muted)", display: "inline-block" }} />
              Custom API
            </div>
            <div className="settings-row__hint">Any OpenAI-compatible endpoint</div>
          </div>
          <input type="text" className="input input--sm" placeholder="Endpoint URL" />
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" className="input input--sm" placeholder="Model" style={{ flex: 1 }} />
            <input type="password" className="input input--sm" placeholder="API key (optional)" style={{ flex: 1 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
