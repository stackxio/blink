import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";

const DOCS_URL = "https://modelcontextprotocol.io";

interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

const RECOMMENDED_SERVERS: Array<{
  id: string;
  name: string;
  by: string;
  description: string;
  icon: string;
  iconBg: string;
  command: string;
  args: string[];
}> = [
  {
    id: "linear",
    name: "Linear",
    by: "Linear",
    description: "Integrate with Linear's issue tracking and project management",
    icon: "L",
    iconBg: "#525252",
    command: "npx",
    args: ["-y", "@linear/mcp"],
  },
  {
    id: "notion",
    name: "Notion",
    by: "Notion",
    description: "Read docs, update pages, manage tasks",
    icon: "N",
    iconBg: "#525252",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
  },
  {
    id: "figma",
    name: "Figma",
    by: "Figma",
    description: "Generate better code by bringing in full Figma context",
    icon: "F",
    iconBg: "#9333ea",
    command: "npx",
    args: ["-y", "figma-mcp"],
  },
  {
    id: "playwright",
    name: "Playwright",
    by: "Microsoft",
    description: "Integrate browser automation to implement and test UI.",
    icon: "P",
    iconBg: "#059669",
    command: "npx",
    args: ["-y", "@playwright/mcp"],
  },
];

export default function SettingsMcp() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    try {
      const list = await invoke<McpServer[]>("list_mcp_servers");
      setServers(list);
    } catch {
      setServers([]);
    }
  }

  async function handleInstall(server: (typeof RECOMMENDED_SERVERS)[number]) {
    try {
      await invoke("add_mcp_server", {
        server: { name: server.name, command: server.command, args: server.args, env: {} },
      });
      await loadServers();
    } catch {
      // non-critical
    }
  }

  async function handleRemove(name: string) {
    try {
      await invoke("remove_mcp_server", { name });
      await loadServers();
    } catch {
      // non-critical
    }
  }

  async function handleAdd() {
    if (!newName.trim() || !newCommand.trim()) return;
    const args = newArgs.trim() ? newArgs.trim().split(/\s+/) : [];
    try {
      await invoke("add_mcp_server", {
        server: { name: newName.trim(), command: newCommand.trim(), args, env: {} },
      });
      await loadServers();
      setShowAddForm(false);
      setNewName("");
      setNewCommand("");
      setNewArgs("");
    } catch {
      // non-critical
    }
  }

  const installedNames = new Set(servers.map((s) => s.name));

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
          <ExternalLink
            size={12}
            style={{ display: "inline", marginLeft: 4, verticalAlign: "middle" }}
          />
        </a>
      </p>

      {/* Custom servers */}
      <h2 className="settings-section__subtitle">Installed servers</h2>
      <div className="settings-card">
        {servers.length === 0 && !showAddForm ? (
          <div className="settings-row">
            <div className="settings-row__info">
              <div className="settings-row__hint">No MCP servers configured</div>
            </div>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => setShowAddForm(true)}
            >
              <Plus size={14} />
              Add server
            </button>
          </div>
        ) : (
          <>
            {servers.map((s) => (
              <div key={s.name} className="settings-row">
                <div className="settings-row__info">
                  <div className="settings-row__label">{s.name}</div>
                  <div className="settings-row__hint">
                    {s.command} {s.args.join(" ")}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  onClick={() => handleRemove(s.name)}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!showAddForm && (
              <div className="settings-row">
                <div className="settings-row__info" />
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus size={14} />
                  Add server
                </button>
              </div>
            )}
          </>
        )}

        {showAddForm && (
          <div
            style={{
              padding: 12,
              borderTop: servers.length > 0 ? "1px solid var(--c-border)" : undefined,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                className="input input--sm"
                placeholder="Name (e.g. Linear)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <input
                type="text"
                className="input input--sm"
                placeholder="Command (e.g. npx)"
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
              />
            </div>
            <input
              type="text"
              className="input input--sm"
              placeholder="Args (e.g. -y @linear/mcp)"
              value={newArgs}
              onChange={(e) => setNewArgs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setShowAddForm(false);
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShowAddForm(false)}
              >
                <X size={14} />
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--default btn--sm"
                onClick={handleAdd}
                disabled={!newName.trim() || !newCommand.trim()}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recommended servers */}
      <h2 className="settings-section__subtitle" style={{ marginTop: 24 }}>
        Recommended servers
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {RECOMMENDED_SERVERS.map((server) => {
          const installed = installedNames.has(server.name);
          return (
            <div key={server.id} className="settings-card">
              <div className="settings-row">
                <div
                  style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}
                >
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
                {installed ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => handleRemove(server.name)}
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--default btn--sm"
                    onClick={() => handleInstall(server)}
                  >
                    Install
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
