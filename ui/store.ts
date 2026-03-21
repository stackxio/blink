import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type SidePanelView = "explorer" | "chat" | "search" | "git";
export type Theme = "dark" | "light" | "system";

export interface OpenFile {
  path: string;
  name: string;
  modified: boolean;
  preview: boolean;
}

export interface Workspace {
  id: string;
  path: string;
  name: string;
  // Editor
  openFiles: OpenFile[];
  activeFileIdx: number;
  // Layout (per-workspace)
  sidePanelOpen: boolean;
  sidePanelView: SidePanelView;
  sidePanelWidth: number;
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  // Terminal sessions (IDs tracked per workspace)
  terminalIds: string[];
  activeTerminalId: string | null;
  // File tree expanded paths
  expandedDirs: Set<string>;
}

function createWorkspace(id: string, path: string, name: string): Workspace {
  return {
    id, path, name,
    openFiles: [], activeFileIdx: -1,
    sidePanelOpen: true, sidePanelView: "explorer", sidePanelWidth: 260,
    bottomPanelOpen: false, bottomPanelHeight: 200,
    terminalIds: [], activeTerminalId: null,
    expandedDirs: new Set(),
  };
}

interface AppState {
  // Global
  theme: Theme;
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  persistWorkspaces: boolean;

  // Workspaces
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  // Computed
  activeWorkspace: () => Workspace | null;

  // Global actions
  setTheme: (t: Theme) => void;
  toggleAiPanel: () => void;
  setAiPanelWidth: (w: number) => void;
  setPersistWorkspaces: (v: boolean) => void;

  // Workspace actions
  addWorkspace: (path: string, name: string) => void;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  loadSavedWorkspaces: () => Promise<void>;
  saveCurrentWorkspaces: () => Promise<void>;

  // Per-workspace layout actions (operate on active workspace)
  toggleSidePanel: () => void;
  setSidePanelView: (view: SidePanelView) => void;
  setSidePanelWidth: (w: number) => void;
  toggleBottomPanel: () => void;
  setBottomPanelHeight: (h: number) => void;

  // Per-workspace editor actions
  openFile: (path: string, name: string, preview?: boolean) => void;
  closeFile: (idx: number) => void;
  setActiveFile: (idx: number) => void;
  markModified: (path: string, modified: boolean) => void;

  // Per-workspace terminal tracking
  addTerminalId: (termId: string) => void;
  removeTerminalId: (termId: string) => void;
  setActiveTerminalId: (termId: string | null) => void;

  // Per-workspace file tree
  toggleExpandedDir: (dirPath: string) => void;
}

function updateWs(state: AppState, updater: (ws: Workspace) => Partial<Workspace>): Partial<AppState> {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws) return {};
  return {
    workspaces: state.workspaces.map((w) =>
      w.id === state.activeWorkspaceId ? { ...w, ...updater(w) } : w,
    ),
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: "dark",
  aiPanelOpen: false,
  aiPanelWidth: 360,
  persistWorkspaces: true,
  workspaces: [],
  activeWorkspaceId: null,

  activeWorkspace: () => {
    const s = get();
    return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null;
  },

  setTheme: (t) => set({ theme: t }),
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAiPanelWidth: (w) => set({ aiPanelWidth: w }),
  setPersistWorkspaces: (v) => set({ persistWorkspaces: v }),

  // ── Workspace management ──

  addWorkspace: (path, name) => {
    const existing = get().workspaces.find((w) => w.path === path);
    if (existing) {
      set({ activeWorkspaceId: existing.id });
      return;
    }
    const id = `ws-${Date.now()}`;
    const ws = createWorkspace(id, path, name);
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      activeWorkspaceId: id,
    }));
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  removeWorkspace: (id) => {
    set((s) => {
      const next = s.workspaces.filter((w) => w.id !== id);
      let newActive = s.activeWorkspaceId;
      if (s.activeWorkspaceId === id) {
        newActive = next.length > 0 ? next[next.length - 1].id : null;
      }
      return { workspaces: next, activeWorkspaceId: newActive };
    });
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id });
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  loadSavedWorkspaces: async () => {
    try {
      const saved = await invoke<{
        id: string; path: string; name: string; is_active: boolean;
        open_files: { path: string; name: string; is_active: boolean; is_preview: boolean }[];
      }[]>("load_workspaces");

      if (saved.length === 0) return;

      const workspaces: Workspace[] = saved.map((s) => {
        const ws = createWorkspace(s.id, s.path, s.name);
        ws.openFiles = s.open_files.map((f) => ({
          path: f.path, name: f.name, modified: false, preview: f.is_preview,
        }));
        const activeIdx = s.open_files.findIndex((f) => f.is_active);
        ws.activeFileIdx = activeIdx >= 0 ? activeIdx : s.open_files.length > 0 ? 0 : -1;
        return ws;
      });

      const activeWs = saved.find((s) => s.is_active);
      set({
        workspaces,
        activeWorkspaceId: activeWs?.id ?? workspaces[0]?.id ?? null,
      });
    } catch {
      // DB might not have the table yet on first run
    }
  },

  saveCurrentWorkspaces: async () => {
    const { workspaces, activeWorkspaceId } = get();
    try {
      await invoke("save_workspaces", {
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          path: ws.path,
          name: ws.name,
          position: 0,
          is_active: ws.id === activeWorkspaceId,
          open_files: ws.openFiles.map((f, i) => ({
            path: f.path,
            name: f.name,
            position: i,
            is_active: i === ws.activeFileIdx,
            is_preview: f.preview,
          })),
        })),
      });
    } catch {
      // Non-critical
    }
  },

  // ── Per-workspace layout ──

  toggleSidePanel: () => set((s) => updateWs(s, (ws) => ({ sidePanelOpen: !ws.sidePanelOpen }))),
  setSidePanelView: (view) => set((s) => updateWs(s, (ws) => ({
    sidePanelView: view,
    sidePanelOpen: ws.sidePanelView === view && ws.sidePanelOpen ? false : true,
  }))),
  setSidePanelWidth: (w) => set((s) => updateWs(s, () => ({ sidePanelWidth: w }))),
  toggleBottomPanel: () => set((s) => updateWs(s, (ws) => ({ bottomPanelOpen: !ws.bottomPanelOpen }))),
  setBottomPanelHeight: (h) => set((s) => updateWs(s, () => ({ bottomPanelHeight: h }))),

  // ── Per-workspace editor ──

  openFile: (path, name, preview = false) => {
    set((s) => {
      if (s.workspaces.length === 0) {
        const id = `ws-${Date.now()}`;
        const ws = createWorkspace(id, "", "Untitled");
        const newFile: OpenFile = { path, name, modified: false, preview };
        ws.openFiles = [newFile];
        ws.activeFileIdx = 0;
        return { workspaces: [ws], activeWorkspaceId: id };
      }
      return updateWs(s, (ws) => {
        const { openFiles } = ws;
        const existing = openFiles.findIndex((f) => f.path === path);
        if (existing !== -1) {
          return {
            activeFileIdx: existing,
            openFiles: preview ? openFiles : openFiles.map((f, i) => (i === existing ? { ...f, preview: false } : f)),
          };
        }
        if (preview) {
          const previewIdx = openFiles.findIndex((f) => f.preview);
          if (previewIdx !== -1) {
            const updated = [...openFiles];
            updated[previewIdx] = { path, name, modified: false, preview: true };
            return { openFiles: updated, activeFileIdx: previewIdx };
          }
        }
        return { openFiles: [...openFiles, { path, name, modified: false, preview }], activeFileIdx: openFiles.length };
      });
    });
  },

  closeFile: (idx) => set((s) => updateWs(s, (ws) => {
    const updated = ws.openFiles.filter((_, i) => i !== idx);
    let newActive = ws.activeFileIdx;
    if (idx === ws.activeFileIdx) newActive = Math.min(idx, updated.length - 1);
    else if (idx < ws.activeFileIdx) newActive = ws.activeFileIdx - 1;
    return { openFiles: updated, activeFileIdx: newActive };
  })),

  setActiveFile: (idx) => set((s) => updateWs(s, () => ({ activeFileIdx: idx }))),

  markModified: (path, modified) => set((s) => updateWs(s, (ws) => ({
    openFiles: ws.openFiles.map((f) => (f.path === path ? { ...f, modified } : f)),
  }))),

  // ── Per-workspace terminals ──

  addTerminalId: (termId) => set((s) => updateWs(s, (ws) => ({
    terminalIds: [...ws.terminalIds, termId],
    activeTerminalId: termId,
  }))),

  removeTerminalId: (termId) => set((s) => updateWs(s, (ws) => {
    const next = ws.terminalIds.filter((id) => id !== termId);
    return {
      terminalIds: next,
      activeTerminalId: ws.activeTerminalId === termId
        ? (next.length > 0 ? next[next.length - 1] : null)
        : ws.activeTerminalId,
    };
  })),

  setActiveTerminalId: (termId) => set((s) => updateWs(s, () => ({ activeTerminalId: termId }))),

  // ── File tree ──

  toggleExpandedDir: (dirPath) => set((s) => updateWs(s, (ws) => {
    const next = new Set(ws.expandedDirs);
    if (next.has(dirPath)) next.delete(dirPath);
    else next.add(dirPath);
    return { expandedDirs: next };
  })),
}));
