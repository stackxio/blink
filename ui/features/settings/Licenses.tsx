import { useNavigate } from "react-router";

export default function SettingsLicenses() {
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/settings/about")}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg
            className="h-3.5 w-3.5"
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
      <h1 className="mb-4 text-lg font-semibold text-foreground">Open source licenses</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Third-party notices for bundled dependencies.
      </p>
      <div className="rounded-lg border border-border bg-surface p-4">
        <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
          {`Caret uses the following open source software. Notices and licenses are listed below.

(Add your bundled dependency notices here. You can generate this from your lockfile or use a tool like license-checker.)`}
        </pre>
      </div>
    </div>
  );
}
