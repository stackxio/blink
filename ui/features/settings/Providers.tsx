export default function SettingsProviders() {
  return (
    <div className="settings-section">
      <h1 className="settings-section__title">AI Providers</h1>

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
            <input type="text" className="input input--sm" placeholder="http://localhost:11434" />
            <input type="text" className="input input--sm settings-row__input--narrow" placeholder="Model (e.g. llama3)" />
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row settings-row--stacked">
          <div>
            <div className="settings-row__label">
              <span className="settings-row__status-dot" />
              Custom API
            </div>
            <div className="settings-row__hint">Any OpenAI-compatible endpoint</div>
          </div>
          <input type="text" className="input input--sm" placeholder="Endpoint URL" />
          <div className="settings-row__inputs">
            <input type="text" className="input input--sm" placeholder="Model" />
            <input type="password" className="input input--sm" placeholder="API key (optional)" />
          </div>
        </div>
      </div>
    </div>
  );
}
