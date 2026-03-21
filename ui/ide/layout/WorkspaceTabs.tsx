import { X, Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, type Workspace } from "@/store";

/** Show parent dir when multiple workspaces share the same folder name */
function getDisplayName(ws: Workspace, all: Workspace[]): string {
  const dupes = all.filter((w) => w.name === ws.name);
  if (dupes.length <= 1) return ws.name;
  // Show parent directory as disambiguator
  const parts = ws.path.split("/");
  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  return parent ? `${ws.name} (${parent})` : ws.name;
}

export default function WorkspaceTabs() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, removeWorkspace, addWorkspace } =
    useAppStore();

  async function handleAdd() {
    try {
      const path = await invoke<string | null>("open_folder_dialog");
      if (path) {
        const name = path.split("/").pop() || path;
        addWorkspace(path, name);
      }
    } catch {
      // cancelled
    }
  }

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
              onClick={(e) => {
                e.stopPropagation();
                removeWorkspace(ws.id);
              }}
            >
              <X />
            </span>
          )}
        </button>
      ))}
      <button type="button" className="workspace-tabs__add" onClick={handleAdd} title="Open Folder">
        <Plus />
      </button>
    </div>
  );
}
