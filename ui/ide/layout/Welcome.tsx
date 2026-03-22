import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, FolderOpen, Clock } from "lucide-react";
import { useAppStore } from "@/store";

interface RecentWorkspace {
  path: string;
  name: string;
  lastOpened: number;
}

function getRecentWorkspaces(): RecentWorkspace[] {
  try {
    return JSON.parse(localStorage.getItem("caret:recent-workspaces") || "[]");
  } catch {
    return [];
  }
}

export default function Welcome() {
  const addWorkspace = useAppStore((s) => s.addWorkspace);
  const openPaths = useAppStore((s) => new Set(s.workspaces.map((w) => w.path)));
  const [recent, setRecent] = useState<RecentWorkspace[]>([]);

  useEffect(() => {
    setRecent(getRecentWorkspaces().filter((r) => !openPaths.has(r.path)));
  }, [openPaths]);

  async function handleOpenFolder() {
    try {
      const path = await invoke<string | null>("open_folder_dialog");
      if (path) {
        const name = path.split("/").pop() || path;
        addWorkspace(path, name);
      }
    } catch {}
  }

  function handleOpenRecent(path: string, name: string) {
    addWorkspace(path, name);
  }

  function shortenPath(path: string): string {
    const home = path.replace(/^\/Users\/[^/]+/, "~");
    return home.replace(/\/[^/]+$/, "");
  }

  return (
    <div className="empty-state">
      <Sparkles size={48} className="empty-state__icon" />
      <h1 className="empty-state__title">Caret</h1>
      <p className="empty-state__text">
        Open a folder to start editing, or use the activity bar to navigate.
      </p>

      <button
        type="button"
        className="btn btn--default"
        onClick={handleOpenFolder}
        style={{ marginTop: 16, gap: 6 }}
      >
        <FolderOpen size={16} />
        Open Folder
      </button>

      {recent.length > 0 && (
        <div className="empty-state__recent">
          <div className="empty-state__recent-label">
            <Clock size={12} />
            Recent Workspaces
          </div>
          <div className="empty-state__recent-list">
            {recent.slice(0, 8).map((r) => (
              <button
                key={r.path}
                type="button"
                className="empty-state__recent-item"
                onClick={() => handleOpenRecent(r.path, r.name)}
                title={r.path}
              >
                <span className="empty-state__recent-name">{r.name}</span>
                <span className="empty-state__recent-path">{shortenPath(r.path)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
