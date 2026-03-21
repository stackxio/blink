import { useNavigate } from "react-router";

const APP_VERSION = "0.2.0";

export default function SettingsAbout() {
  const navigate = useNavigate();

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">About</h1>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">App version</div>
            <div className="settings-row__hint">Current application version</div>
          </div>
          <span className="settings-row__value">{APP_VERSION}</span>
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
