import { useNavigate } from "react-router";

export default function SettingsLicenses() {
  const navigate = useNavigate();

  return (
    <div className="settings-section">
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => navigate("/settings/about")}
        >
          <svg
            style={{ width: 14, height: 14 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>
      <h1 className="settings-section__title">Open source licenses</h1>
      <p className="settings-section__description">Third-party notices for bundled dependencies.</p>
      <div className="settings-card" style={{ padding: 16 }}>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: "var(--font-size-xs)",
            lineHeight: 1.6,
            color: "var(--c-fg)",
          }}
        >
          {`Blink uses the following open source software. Notices and licenses are listed below.

(Add your bundled dependency notices here. You can generate this from your lockfile or use a tool like license-checker.)`}
        </pre>
      </div>
    </div>
  );
}
