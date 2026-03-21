import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronLeft, Download, Check, Loader2, Package } from "lucide-react";

interface ServerStatus {
  language_id: string;
  display_name: string;
  extensions: string[];
  command: string;
  installed: boolean;
  install_command: string;
  install_method: string;
}

export default function ExtensionsOverlay() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "installed" | "available">("all");

  useEffect(() => {
    loadServers();

    const unlisten = listen<{ language_id: string; status: string }>("lsp:install:status", (e) => {
      if (e.payload.status === "installed") {
        setInstalling((prev) => { const n = new Set(prev); n.delete(e.payload.language_id); return n; });
        loadServers();
      } else if (e.payload.status === "failed") {
        setInstalling((prev) => { const n = new Set(prev); n.delete(e.payload.language_id); return n; });
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function loadServers() {
    try {
      const list = await invoke<ServerStatus[]>("lsp_list_all_servers");
      setServers(list);
    } catch {
      setServers([]);
    }
  }

  async function handleInstall(langId: string) {
    setInstalling((prev) => new Set(prev).add(langId));
    try {
      await invoke<string>("lsp_install_server", { languageId: langId });
    } catch {
      setInstalling((prev) => { const n = new Set(prev); n.delete(langId); return n; });
    }
  }

  const filtered = servers.filter((s) => {
    if (filter === "installed") return s.installed;
    if (filter === "available") return !s.installed;
    return true;
  });

  const installedCount = servers.filter((s) => s.installed).length;

  return (
    <div className="settings-overlay">
      <div className="settings-overlay__sidebar">
        <button type="button" className="settings-overlay__back" onClick={() => navigate("/")}>
          <ChevronLeft size={14} />
          Back
        </button>
        <nav className="settings-overlay__nav">
          <button
            type="button"
            className={`settings-overlay__nav-item ${filter === "all" ? "settings-overlay__nav-item--active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({servers.length})
          </button>
          <button
            type="button"
            className={`settings-overlay__nav-item ${filter === "installed" ? "settings-overlay__nav-item--active" : ""}`}
            onClick={() => setFilter("installed")}
          >
            Installed ({installedCount})
          </button>
          <button
            type="button"
            className={`settings-overlay__nav-item ${filter === "available" ? "settings-overlay__nav-item--active" : ""}`}
            onClick={() => setFilter("available")}
          >
            Available ({servers.length - installedCount})
          </button>
        </nav>
      </div>

      <div className="settings-overlay__content">
        <div className="settings-overlay__inner">
          <div className="settings-section">
            <h1 className="settings-section__title">Language Servers</h1>
            <p className="settings-section__description">
              Language servers provide autocomplete, diagnostics, hover info, and go-to-definition.
              Install the ones you need for your projects.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((server) => {
                const isInstalling = installing.has(server.language_id);
                return (
                  <div key={server.language_id} className="settings-card">
                    <div className="settings-row">
                      <div className="settings-row__info">
                        <div className="settings-row__label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Package size={16} style={{ opacity: 0.5 }} />
                          {server.display_name}
                          {server.installed && (
                            <span style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 4,
                              background: "color-mix(in srgb, var(--c-success) 15%, transparent)",
                              color: "var(--c-success)",
                            }}>
                              Installed
                            </span>
                          )}
                        </div>
                        <div className="settings-row__hint">
                          {server.extensions.length > 0
                            ? `Files: ${server.extensions.map((e) => `.${e}`).join(", ")}`
                            : "Activated by project configuration"}
                          {" · "}
                          <code style={{ fontSize: 11, opacity: 0.7 }}>{server.command}</code>
                        </div>
                      </div>
                      {server.installed ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--c-success)", fontSize: 13 }}>
                          <Check size={14} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--default btn--sm"
                          onClick={() => handleInstall(server.language_id)}
                          disabled={isInstalling}
                          style={{ minWidth: 80 }}
                        >
                          {isInstalling ? (
                            <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Installing</>
                          ) : (
                            <><Download size={12} /> Install</>
                          )}
                        </button>
                      )}
                    </div>
                    {!server.installed && (
                      <div style={{ padding: "0 16px 10px", fontSize: 11, color: "var(--c-muted-fg)" }}>
                        <code>{server.install_command}</code>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
