import { ExternalLink, Plus, RefreshCw } from "lucide-react";

const DOCS_URL = "https://modelcontextprotocol.io";

const RECOMMENDED_SERVERS = [
  {
    id: "linear",
    name: "Linear",
    by: "Linear",
    description: "Integrate with Linear's issue tracking and project management",
    icon: "L",
    iconBg: "#525252",
  },
  {
    id: "notion",
    name: "Notion",
    by: "Notion",
    description: "Read docs, update pages, manage tasks",
    icon: "N",
    iconBg: "#525252",
  },
  {
    id: "figma",
    name: "Figma",
    by: "Figma",
    description: "Generate better code by bringing in full Figma context",
    icon: "F",
    iconBg: "#9333ea",
  },
  {
    id: "playwright",
    name: "Playwright",
    by: "Microsoft",
    description: "Integrate browser automation to implement design and test UI.",
    icon: "P",
    iconBg: "#059669",
  },
];

export default function SettingsMcp() {
  function handleAddServer() {
    // Placeholder — implement later
  }

  function handleRefresh() {
    // Placeholder — implement later
  }

  function handleInstall(id: string) {
    void id; // placeholder — implement later
    // Placeholder — implement later
  }

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">MCP servers</h1>
      <p className="settings-section__description">
        Connect external tools and data sources.{" "}
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--c-fg)", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          Docs
          <ExternalLink size={12} style={{ display: "inline", marginLeft: 4, verticalAlign: "middle" }} />
        </a>
      </p>

      {/* Custom servers */}
      <h2 className="settings-section__subtitle">Custom servers</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__hint">No custom MCP servers connected</div>
          </div>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={handleAddServer}
          >
            <Plus size={14} />
            Add server
          </button>
        </div>
      </div>

      {/* Recommended servers */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12 }}>
        <h2 className="settings-section__subtitle" style={{ margin: 0 }}>Recommended servers</h2>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={handleRefresh}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RECOMMENDED_SERVERS.map((server) => (
          <div key={server.id} className="settings-card">
            <div className="settings-row">
              <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: server.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: "#fff",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: 600,
                  }}
                >
                  {server.icon}
                </div>
                <div className="settings-row__info">
                  <div className="settings-row__label">
                    {server.name} by {server.by}
                  </div>
                  <div className="settings-row__hint">{server.description}</div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn--default btn--sm"
                onClick={() => handleInstall(server.id)}
              >
                Install
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
