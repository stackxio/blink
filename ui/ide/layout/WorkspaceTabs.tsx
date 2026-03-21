import { useState, useEffect, useRef } from "react";
import { X, Plus, FolderOpen, Clock } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, type Workspace } from "@/store";

interface RecentWorkspace {
  path: string;
  name: string;
  lastOpened: number;
}

function getRecentWorkspaces(): RecentWorkspace[] {
  try {
    return JSON.parse(localStorage.getItem("caret:recent-workspaces") || "[]");
  } catch { return []; }
}

function addToRecent(path: string, name: string) {
  const recent = getRecentWorkspaces().filter((r) => r.path !== path);
  recent.unshift({ path, name, lastOpened: Date.now() });
  localStorage.setItem("caret:recent-workspaces", JSON.stringify(recent.slice(0, 20)));
}

function removeFromRecent(path: string) {
  const recent = getRecentWorkspaces().filter((r) => r.path !== path);
  localStorage.setItem("caret:recent-workspaces", JSON.stringify(recent));
}

function getDisplayName(ws: Workspace, all: Workspace[]): string {
  const dupes = all.filter((w) => w.name === ws.name);
  if (dupes.length <= 1) return ws.name;
  const parts = ws.path.split("/");
  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  return parent ? `${ws.name} (${parent})` : ws.name;
}

export default function WorkspaceTabs() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, removeWorkspace, addWorkspace } =
    useAppStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [recentFilter, setRecentFilter] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track opens in recent history
  useEffect(() => {
    workspaces.forEach((ws) => {
      if (ws.path) addToRecent(ws.path, ws.name);
    });
  }, [workspaces]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    setTimeout(() => {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [dropdownOpen]);

  useEffect(() => {
    if (dropdownOpen) {
      setRecentFilter("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [dropdownOpen]);

  async function handleOpenFolder() {
    setDropdownOpen(false);
    try {
      const path = await invoke<string | null>("open_folder_dialog");
      if (path) {
        const name = path.split("/").pop() || path;
        addWorkspace(path, name);
      }
    } catch {}
  }

  function handleSelectRecent(path: string, name: string) {
    setDropdownOpen(false);
    addWorkspace(path, name);
  }

  const openPaths = new Set(workspaces.map((w) => w.path));
  const recent = getRecentWorkspaces()
    .filter((r) => !openPaths.has(r.path))
    .filter((r) => !recentFilter || r.name.toLowerCase().includes(recentFilter.toLowerCase()) || r.path.toLowerCase().includes(recentFilter.toLowerCase()));

  return (
    <div className="workspace-tabs">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          type="button"
          className={`workspace-tabs__tab ${ws.id === activeWorkspaceId ? "workspace-tabs__tab--active" : ""}`}
          onClick={() => setActiveWorkspace(ws.id)}
          title={ws.path}
        >
          {getDisplayName(ws, workspaces)}
          {workspaces.length > 1 && (
            <span
              className="workspace-tabs__close"
              onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }}
            >
              <X />
            </span>
          )}
        </button>
      ))}

      <div className="workspace-tabs__dropdown-wrapper">
        <button
          type="button"
          className="workspace-tabs__add"
          onClick={() => setDropdownOpen((v) => !v)}
          title="Open Workspace"
        >
          <Plus />
        </button>

        {dropdownOpen && (
          <div ref={dropdownRef} className="workspace-tabs__dropdown">
            <div className="menu__search">
              <input
                ref={inputRef}
                type="text"
                className="input input--sm"
                placeholder="Search projects…"
                value={recentFilter}
                onChange={(e) => setRecentFilter(e.target.value)}
              />
            </div>

            <button type="button" className="menu__item" onClick={handleOpenFolder}>
              <FolderOpen size={14} />
              Open Folder…
            </button>

            {recent.length > 0 && (
              <>
                <div className="menu__separator" />
                <div className="menu__label">
                  <Clock size={10} style={{ display: "inline", marginRight: 4 }} />
                  Recent
                </div>
                <div className="workspace-tabs__recent-list">
                  {recent.map((r) => (
                    <button
                      key={r.path}
                      type="button"
                      className="menu__item workspace-tabs__recent-item"
                      onClick={() => handleSelectRecent(r.path, r.name)}
                    >
                      <span className="workspace-tabs__recent-name">{r.name}</span>
                      <span className="workspace-tabs__recent-path">{r.path.replace(/\/[^/]+$/, "")}</span>
                      <span
                        className="workspace-tabs__recent-remove"
                        onClick={(e) => { e.stopPropagation(); removeFromRecent(r.path); setDropdownOpen(false); setTimeout(() => setDropdownOpen(true), 0); }}
                        title="Remove from recent"
                      >
                        <X size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
