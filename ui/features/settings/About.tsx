import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { getVersion } from "@tauri-apps/api/app";

export default function SettingsAbout() {
  const navigate = useNavigate();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">About</h1>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">App version</div>
            <div className="settings-row__hint">Current application version</div>
          </div>
          <span className="settings-row__value">{version ?? "…"}</span>
        </div>
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Open source licenses</div>
            <div className="settings-row__hint">Third-party notices for bundled dependencies.</div>
          </div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate("/settings/licenses")}>
            View
          </button>
        </div>
      </div>
    </div>
  );
}
