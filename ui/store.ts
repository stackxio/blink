import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { changeTheme } from "@/lib/theme";

export type SidePanelView = "explorer" | "chat" | "search" | "git";
export type BottomPanelTab = "terminal" | "problems";

export interface DiagnosticEntry {
  uri: string;
  severity: number; // 1=error 2=warning 3=info 4=hint
  message: string;
  line: number;
  character: number;
}
export type Theme = "dark" | "light" | "system";

export interface OpenFile {
  path: string;
  name: string;
  modified: boolean;
  preview: boolean;
  cursorLine: number;
  cursorCol: number;
  scrollTop: number;
  deleted: boolean;
}

export interface Workspace {
  id: string;
  path: string;
  name: string;
  // Editor — primary pane
  openFiles: OpenFile[];
  activeFileIdx: number;
  // Editor — split pane (null = no split)
  splitFiles: OpenFile[];
  splitActiveIdx: number;
  splitOpen: boolean;
  // Layout (per-workspace)
  sidePanelOpen: boolean;
  sidePanelView: SidePanelView;
  sidePanelWidth: number;
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  bottomPanelTab: BottomPanelTab;
  // Terminal sessions (IDs tracked per workspace)
  terminalIds: string[];
  activeTerminalId: string | null;
  // File tree expanded paths
  expandedDirs: Set<string>;
}

function sidebarViewStorageKey(path: string) {
  return `blink:sidebar-view:${path}`;
}

function loadSidebarView(path: string): SidePanelView {
  try {
    const stored = localStorage.getItem(sidebarViewStorageKey(path));
    if (stored === "explorer" || stored === "chat" || stored === "search" || stored === "git") {
      return stored;
    }
  } catch {}
  return "explorer";
}

function saveSidebarView(path: string, view: SidePanelView) {
  try {
    localStorage.setItem(sidebarViewStorageKey(path), view);
  } catch {}
}

function createWorkspace(id: string, path: string, name: string): Workspace {
  return {
    id,
    path,
    name,
    openFiles: [],
    activeFileIdx: -1,
    splitFiles: [],
    splitActiveIdx: -1,
    splitOpen: false,
    sidePanelOpen: true,
    sidePanelView: path ? loadSidebarView(path) : "explorer",
    sidePanelWidth: 300,
    bottomPanelOpen: false,
    bottomPanelHeight: 200,
    bottomPanelTab: "terminal",
    terminalIds: [],
    activeTerminalId: null,
    expandedDirs: new Set(),
  };
}

interface AppState {
  // Global
  theme: Theme;
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  persistWorkspaces: boolean;
  // Diagnostics (global — keyed by file URI)
  diagnostics: Record<string, DiagnosticEntry[]>;
  diagnosticSummary: { errors: number; warnings: number };
  setDiagnosticsForUri: (uri: string, diags: DiagnosticEntry[]) => void;

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
  setBottomPanelTab: (tab: BottomPanelTab) => void;

  // Per-workspace editor actions
  openFile: (path: string, name: string, preview?: boolean) => void;
  closeFile: (idx: number) => void;
  closeAllFiles: () => void;
  closeOtherFiles: (idx: number) => void;
  setActiveFile: (idx: number) => void;
  markModified: (path: string, modified: boolean) => void;
  updateFileState: (
    path: string,
    state: { cursorLine?: number; cursorCol?: number; scrollTop?: number },
  ) => void;
  markFileDeleted: (path: string) => void;

  // Per-workspace split editor
  openFileSplit: (path: string, name: string) => void;
  closeFileSplit: (idx: number) => void;
  setActiveSplitFile: (idx: number) => void;
  closeSplit: () => void;

  // Per-workspace terminal tracking
  addTerminalId: (termId: string) => void;
  removeTerminalId: (termId: string) => void;
  setActiveTerminalId: (termId: string | null) => void;

  // Per-workspace file tree
  toggleExpandedDir: (dirPath: string) => void;
}

function updateWs(
  state: AppState,
  updater: (ws: Workspace) => Partial<Workspace>,
): Partial<AppState> {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!ws) return {};
  const patch = updater(ws);
  if (Object.keys(patch).length === 0) return {};
  return {
    workspaces: state.workspaces.map((w) =>
      w.id === state.activeWorkspaceId ? { ...w, ...patch } : w,
    ),
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: "dark",
  aiPanelOpen: true,
  aiPanelWidth: 560,
  persistWorkspaces: true,
  diagnostics: {},
  diagnosticSummary: { errors: 0, warnings: 0 },
  setDiagnosticsForUri: (uri, diags) =>
    set((s) => {
      const diagnostics = { ...s.diagnostics, [uri]: diags };
      let errors = 0;
      let warnings = 0;
      for (const entries of Object.values(diagnostics)) {
        for (const entry of entries) {
          if (entry.severity === 1) errors += 1;
          else if (entry.severity === 2) warnings += 1;
        }
      }
      return { diagnostics, diagnosticSummary: { errors, warnings } };
    }),
  workspaces: [],
  activeWorkspaceId: null,

  activeWorkspace: () => {
    const s = get();
    return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null;
  },

  setTheme: (t) => {
    set({ theme: t });
    changeTheme(t);
  },
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
      const saved = await invoke<
        {
          id: string;
          path: string;
          name: string;
          is_active: boolean;
          open_files: { path: string; name: string; is_active: boolean; is_preview: boolean }[];
        }[]
      >("load_workspaces");

      if (saved.length === 0) return;

      const workspaces: Workspace[] = saved.map((s) => {
        const ws = createWorkspace(s.id, s.path, s.name);
        ws.openFiles = s.open_files.map((f) => ({
          path: f.path,
          name: f.name,
          modified: false,
          preview: f.is_preview,
          cursorLine: 0,
          cursorCol: 0,
          scrollTop: 0,
          deleted: false,
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
  setSidePanelView: (view) =>
    set((s) =>
      updateWs(s, (ws) => {
        if (ws.path) {
          saveSidebarView(ws.path, view);
        }
        return {
          sidePanelView: view,
          sidePanelOpen: ws.sidePanelView === view && ws.sidePanelOpen ? false : true,
        };
      }),
    ),
  setSidePanelWidth: (w) => set((s) => updateWs(s, () => ({ sidePanelWidth: w }))),
  toggleBottomPanel: () =>
    set((s) => updateWs(s, (ws) => ({ bottomPanelOpen: !ws.bottomPanelOpen }))),
  setBottomPanelHeight: (h) => set((s) => updateWs(s, () => ({ bottomPanelHeight: h }))),
  setBottomPanelTab: (tab) => set((s) => updateWs(s, () => ({ bottomPanelTab: tab }))),

  // ── Per-workspace editor ──

  openFile: (path, name, preview = false) => {
    set((s) => {
      if (s.workspaces.length === 0) {
        const id = `ws-${Date.now()}`;
        const ws = createWorkspace(id, "", "Untitled");
        const newFile: OpenFile = {
          path,
          name,
          modified: false,
          preview,
          cursorLine: 0,
          cursorCol: 0,
          scrollTop: 0,
          deleted: false,
        };
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
            openFiles: preview
              ? openFiles
              : openFiles.map((f, i) => (i === existing ? { ...f, preview: false } : f)),
          };
        }
        if (preview) {
          const previewIdx = openFiles.findIndex((f) => f.preview);
          if (previewIdx !== -1) {
            const updated = [...openFiles];
            updated[previewIdx] = {
              path,
              name,
              modified: false,
              preview: true,
              cursorLine: 0,
              cursorCol: 0,
              scrollTop: 0,
              deleted: false,
            };
            return { openFiles: updated, activeFileIdx: previewIdx };
          }
        }
        return {
          openFiles: [
            ...openFiles,
            {
              path,
              name,
              modified: false,
              preview,
              cursorLine: 0,
              cursorCol: 0,
              scrollTop: 0,
              deleted: false,
            },
          ],
          activeFileIdx: openFiles.length,
        };
      });
    });
  },

  closeFile: (idx) =>
    set((s) =>
      updateWs(s, (ws) => {
        const updated = ws.openFiles.filter((_, i) => i !== idx);
        let newActive = ws.activeFileIdx;
        if (idx === ws.activeFileIdx) newActive = Math.min(idx, updated.length - 1);
        else if (idx < ws.activeFileIdx) newActive = ws.activeFileIdx - 1;
        return { openFiles: updated, activeFileIdx: newActive };
      }),
    ),

  closeAllFiles: () =>
    set((s) =>
      updateWs(s, () => ({
        openFiles: [],
        activeFileIdx: -1,
      })),
    ),

  closeOtherFiles: (idx) =>
    set((s) =>
      updateWs(s, (ws) => {
        const kept = ws.openFiles[idx];
        if (!kept) return { openFiles: [], activeFileIdx: -1 };
        return { openFiles: [kept], activeFileIdx: 0 };
      }),
    ),

  setActiveFile: (idx) => set((s) => updateWs(s, () => ({ activeFileIdx: idx }))),

  markModified: (path, modified) =>
    set((s) =>
      updateWs(s, (ws) => ({
        openFiles: ws.openFiles.map((f) =>
          f.path === path ? { ...f, modified, ...(modified ? { preview: false } : {}) } : f,
        ),
      })),
    ),

  updateFileState: (path, fileState) =>
    set((s) =>
      updateWs(s, (ws) => {
        const index = ws.openFiles.findIndex((f) => f.path === path);
        if (index === -1) return {};
        const current = ws.openFiles[index];
        const nextCursorLine = fileState.cursorLine ?? current.cursorLine;
        const nextCursorCol = fileState.cursorCol ?? current.cursorCol;
        const nextScrollTop = fileState.scrollTop ?? current.scrollTop;
        if (
          nextCursorLine === current.cursorLine &&
          nextCursorCol === current.cursorCol &&
          nextScrollTop === current.scrollTop
        ) {
          return {};
        }
        const openFiles = [...ws.openFiles];
        openFiles[index] = {
          ...current,
          cursorLine: nextCursorLine,
          cursorCol: nextCursorCol,
          scrollTop: nextScrollTop,
        };
        return { openFiles };
      }),
    ),

  markFileDeleted: (path) =>
    set((s) =>
      updateWs(s, (ws) => ({
        openFiles: ws.openFiles.map((f) => (f.path === path ? { ...f, deleted: true } : f)),
      })),
    ),

  // ── Split editor ──

  openFileSplit: (path, name) =>
    set((s) =>
      updateWs(s, (ws) => {
        const existing = ws.splitFiles.findIndex((f) => f.path === path);
        if (existing !== -1) return { splitOpen: true, splitActiveIdx: existing };
        const newFile: OpenFile = {
          path,
          name,
          modified: false,
          preview: false,
          cursorLine: 0,
          cursorCol: 0,
          scrollTop: 0,
          deleted: false,
        };
        return {
          splitOpen: true,
          splitFiles: [...ws.splitFiles, newFile],
          splitActiveIdx: ws.splitFiles.length,
        };
      }),
    ),

  closeFileSplit: (idx) =>
    set((s) =>
      updateWs(s, (ws) => {
        const updated = ws.splitFiles.filter((_, i) => i !== idx);
        let newActive = ws.splitActiveIdx;
        if (idx === ws.splitActiveIdx) newActive = Math.min(idx, updated.length - 1);
        else if (idx < ws.splitActiveIdx) newActive = ws.splitActiveIdx - 1;
        return { splitFiles: updated, splitActiveIdx: newActive, splitOpen: updated.length > 0 };
      }),
    ),

  setActiveSplitFile: (idx) => set((s) => updateWs(s, () => ({ splitActiveIdx: idx }))),

  closeSplit: () =>
    set((s) => updateWs(s, () => ({ splitOpen: false, splitFiles: [], splitActiveIdx: -1 }))),

  // ── Per-workspace terminals ──

  addTerminalId: (termId) =>
    set((s) =>
      updateWs(s, (ws) => ({
        terminalIds: [...ws.terminalIds, termId],
        activeTerminalId: termId,
      })),
    ),

  removeTerminalId: (termId) =>
    set((s) =>
      updateWs(s, (ws) => {
        const next = ws.terminalIds.filter((id) => id !== termId);
        return {
          terminalIds: next,
          activeTerminalId:
            ws.activeTerminalId === termId
              ? next.length > 0
                ? next[next.length - 1]
                : null
              : ws.activeTerminalId,
        };
      }),
    ),

  setActiveTerminalId: (termId) => set((s) => updateWs(s, () => ({ activeTerminalId: termId }))),

  // ── File tree ──

  toggleExpandedDir: (dirPath) =>
    set((s) =>
      updateWs(s, (ws) => {
        const next = new Set(ws.expandedDirs);
        if (next.has(dirPath)) next.delete(dirPath);
        else next.add(dirPath);
        return { expandedDirs: next };
      }),
    ),
}));
