import type { SettingsPage } from "@/store";

interface Props {
  onNavigate: (page: SettingsPage) => void;
}

interface LicenseEntry {
  name: string;
  license: string;
  repository: string;
}

const LICENSES: LicenseEntry[] = [
  {
    name: "@codemirror/autocomplete",
    license: "MIT",
    repository: "https://github.com/codemirror/autocomplete",
  },
  {
    name: "@codemirror/commands",
    license: "MIT",
    repository: "https://github.com/codemirror/commands",
  },
  {
    name: "@codemirror/lang-angular",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-angular",
  },
  {
    name: "@codemirror/lang-cpp",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-cpp",
  },
  {
    name: "@codemirror/lang-css",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-css",
  },
  {
    name: "@codemirror/lang-go",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-go",
  },
  {
    name: "@codemirror/lang-html",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-html",
  },
  {
    name: "@codemirror/lang-java",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-java",
  },
  {
    name: "@codemirror/lang-javascript",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-javascript",
  },
  {
    name: "@codemirror/lang-json",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-json",
  },
  {
    name: "@codemirror/lang-less",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-less",
  },
  {
    name: "@codemirror/lang-liquid",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-liquid",
  },
  {
    name: "@codemirror/lang-markdown",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-markdown",
  },
  {
    name: "@codemirror/lang-php",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-php",
  },
  {
    name: "@codemirror/lang-python",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-python",
  },
  {
    name: "@codemirror/lang-rust",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-rust",
  },
  {
    name: "@codemirror/lang-sass",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-sass",
  },
  {
    name: "@codemirror/lang-sql",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-sql",
  },
  {
    name: "@codemirror/lang-vue",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-vue",
  },
  {
    name: "@codemirror/lang-xml",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-xml",
  },
  {
    name: "@codemirror/lang-yaml",
    license: "MIT",
    repository: "https://github.com/codemirror/lang-yaml",
  },
  {
    name: "@codemirror/language",
    license: "MIT",
    repository: "https://github.com/codemirror/language",
  },
  { name: "@codemirror/lint", license: "MIT", repository: "https://github.com/codemirror/lint" },
  {
    name: "@codemirror/search",
    license: "MIT",
    repository: "https://github.com/codemirror/search",
  },
  { name: "@codemirror/state", license: "MIT", repository: "https://github.com/codemirror/state" },
  { name: "@codemirror/view", license: "MIT", repository: "https://github.com/codemirror/view" },
  {
    name: "@lezer/highlight",
    license: "MIT",
    repository: "https://github.com/lezer-parser/highlight",
  },
  {
    name: "@replit/codemirror-indentation-markers",
    license: "MIT",
    repository: "https://github.com/replit/codemirror-indentation-markers",
  },
  {
    name: "@replit/codemirror-minimap",
    license: "MIT",
    repository: "https://github.com/replit/codemirror-minimap",
  },
  {
    name: "@tauri-apps/api",
    license: "Apache-2.0 OR MIT",
    repository: "https://github.com/tauri-apps/tauri",
  },
  {
    name: "@tauri-apps/plugin-process",
    license: "MIT OR Apache-2.0",
    repository: "https://github.com/tauri-apps/plugins-workspace",
  },
  {
    name: "@tauri-apps/plugin-updater",
    license: "MIT OR Apache-2.0",
    repository: "https://github.com/tauri-apps/plugins-workspace",
  },
  { name: "@xterm/addon-fit", license: "MIT", repository: "https://github.com/xtermjs/xterm.js" },
  { name: "@xterm/addon-webgl", license: "MIT", repository: "https://github.com/xtermjs/xterm.js" },
  { name: "@xterm/xterm", license: "MIT", repository: "https://github.com/xtermjs/xterm.js" },
  { name: "lucide-react", license: "ISC", repository: "https://github.com/lucide-icons/lucide" },
  {
    name: "material-icon-theme",
    license: "MIT",
    repository: "https://github.com/material-extensions/vscode-material-icon-theme",
  },
  {
    name: "monaco-editor",
    license: "MIT",
    repository: "https://github.com/microsoft/monaco-editor",
  },
  { name: "react", license: "MIT", repository: "https://github.com/facebook/react" },
  { name: "react-dom", license: "MIT", repository: "https://github.com/facebook/react" },
  {
    name: "react-markdown",
    license: "MIT",
    repository: "https://github.com/remarkjs/react-markdown",
  },
  { name: "react-router", license: "MIT", repository: "https://github.com/remix-run/react-router" },
  { name: "remark-gfm", license: "MIT", repository: "https://github.com/remarkjs/remark-gfm" },
  { name: "zustand", license: "MIT", repository: "https://github.com/pmndrs/zustand" },
];

export default function SettingsLicenses({ onNavigate }: Props) {
  return (
    <div className="settings-section">
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onNavigate("about")}
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
      <p className="settings-section__description">
        Codrift is built on the following open source libraries.
      </p>
      <div className="settings-card" style={{ padding: 0, overflow: "hidden" }}>
        {LICENSES.map((entry, i) => (
          <div
            key={entry.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 14px",
              borderBottom: i < LICENSES.length - 1 ? "1px solid var(--c-border)" : undefined,
              gap: 12,
            }}
          >
            <a
              href={entry.repository}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--c-fg)",
                textDecoration: "none",
                fontFamily: "var(--font-mono, monospace)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              {entry.name}
            </a>
            <span
              style={{
                fontSize: 10,
                color: "var(--c-muted-fg)",
                flexShrink: 0,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {entry.license}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
