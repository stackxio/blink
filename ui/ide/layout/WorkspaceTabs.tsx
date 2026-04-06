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
    return JSON.parse(localStorage.getItem("codrift:recent-workspaces") || "[]");
  } catch {
    return [];
  }
}

function addToRecent(path: string, name: string) {
  const recent = getRecentWorkspaces().filter((r) => r.path !== path);
  recent.unshift({ path, name, lastOpened: Date.now() });
  localStorage.setItem("codrift:recent-workspaces", JSON.stringify(recent.slice(0, 20)));
}

function removeFromRecent(path: string) {
  const recent = getRecentWorkspaces().filter((r) => r.path !== path);
  localStorage.setItem("codrift:recent-workspaces", JSON.stringify(recent));
}

function getDisplayName(ws: Workspace, all: Workspace[]) {
  const duplicates = all.filter((entry) => entry.name === ws.name).length;
  const parts = ws.path.split("/");
  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  return duplicates > 1 && parent ? `${ws.name} (${parent})` : ws.name;
}

function WorkspaceTabButton({
  workspace,
  displayName,
  active,
  showClose,
}: {
  workspace: Workspace;
  displayName: string;
  active: boolean;
  showClose: boolean;
}) {
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);
  const removeWorkspace = useAppStore((s) => s.removeWorkspace);
  const modifiedFiles = workspace.openFiles.filter((file) => file.modified);
  const modifiedCount = modifiedFiles.length;

  return (
    <button
      type="button"
      className={`workspace-tabs__tab ${active ? "workspace-tabs__tab--active" : ""}`}
      onClick={() => setActiveWorkspace(workspace.id)}
      title={workspace.path}
    >
      {displayName}
      {showClose && (
        <span
          className="workspace-tabs__close"
          onClick={(e) => {
            e.stopPropagation();
            if (modifiedCount > 0) {
              const msg =
                modifiedCount === 1
                  ? `"${modifiedFiles[0].name}" has unsaved changes. Close workspace anyway?`
                  : `${modifiedCount} files have unsaved changes. Close workspace anyway?`;
              if (!confirm(msg)) return;
            }
            removeWorkspace(workspace.id);
          }}
        >
          <X />
        </span>
      )}
    </button>
  );
}

export default function WorkspaceTabs() {
  const workspaces = useAppStore((s) => s.workspaces);
  const workspaceRecentKey = useAppStore((s) =>
    s.workspaces.map((ws) => `${ws.path}::${ws.name}`).join("|"),
  );
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const addWorkspace = useAppStore((s) => s.addWorkspace);
  const workspaceIds = workspaces.map((ws) => ws.id);
  const workspacePaths = workspaces.map((ws) => ws.path);
  const workspaceNamesByPath = Object.fromEntries(workspaces.map((ws) => [ws.path, ws.name]));

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [recentFilter, setRecentFilter] = useState("");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspaceRecentKey) return;
    for (const path of workspacePaths) {
      if (path) {
        addToRecent(path, workspaceNamesByPath[path] || path.split("/").pop() || path);
      }
    }
  }, [workspaceNamesByPath, workspacePaths, workspaceRecentKey]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
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

  const openPaths = new Set(workspacePaths);
  const recent = getRecentWorkspaces()
    .filter((r) => !openPaths.has(r.path))
    .filter(
      (r) =>
        !recentFilter ||
        r.name.toLowerCase().includes(recentFilter.toLowerCase()) ||
        r.path.toLowerCase().includes(recentFilter.toLowerCase()),
    );

  return (
    <div className="workspace-tabs">
      {workspaces.map((workspace) => (
        <WorkspaceTabButton
          key={workspace.id}
          workspace={workspace}
          displayName={getDisplayName(workspace, workspaces)}
          active={workspace.id === activeWorkspaceId}
          showClose={workspaceIds.length > 1}
        />
      ))}

      <div className="workspace-tabs__dropdown-wrapper">
        <button
          ref={addBtnRef}
          type="button"
          className="workspace-tabs__add"
          onClick={() => {
            if (!dropdownOpen && addBtnRef.current) {
              const rect = addBtnRef.current.getBoundingClientRect();
              setDropdownPos({ top: rect.bottom + 4, left: rect.left });
            }
            setDropdownOpen((v) => !v);
          }}
          title="Open Workspace"
        >
          <Plus />
        </button>

        {dropdownOpen && (
          <div
            ref={dropdownRef}
            className="workspace-tabs__dropdown"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
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
                      <span className="workspace-tabs__recent-path">
                        {r.path.replace(/\/[^/]+$/, "")}
                      </span>
                      <span
                        className="workspace-tabs__recent-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromRecent(r.path);
                          setDropdownOpen(false);
                          setTimeout(() => setDropdownOpen(true), 0);
                        }}
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
