import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { changeTheme } from "@/lib/theme";

// Debounced workspace save — cursor/scroll updates fire on every keystroke/
// scroll event so we don't want to hit SQLite on each one.  After 1.5 s of
// inactivity the final position is persisted.
let _saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(fn: () => void) {
  if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer = setTimeout(fn, 1500);
}

export type SidePanelView = "explorer" | "chat" | "search" | "git" | "history";
export type LayoutMode = "ai-center" | "editor-center";
export type FocusMode = "both" | "ai-only" | "editor-only";
export type BottomPanelTab = "terminal" | "problems";
export type SettingsPage =
  | "general"
  | "providers"
  | "skills"
  | "memory"
  | "appearance"
  | "archived"
  | "about"
  | "licenses";

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
  pinned?: boolean;
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
  // Recently closed tabs (for reopen)
  closedTabHistory: OpenFile[];
  // Recently opened files
  recentFiles: Array<{ path: string; name: string }>;
  // AI-first layout
  layoutMode: LayoutMode;
  focusMode: FocusMode;
  aiPanelWidth: number;
}

function loadLayoutMode(): LayoutMode {
  try {
    const stored = localStorage.getItem("codrift:layoutMode");
    if (stored === "ai-center" || stored === "editor-center") return stored;
  } catch {}
  return "editor-center";
}

function loadFocusMode(): FocusMode {
  try {
    const stored = localStorage.getItem("codrift:focusMode");
    if (stored === "both" || stored === "ai-only" || stored === "editor-only") return stored;
  } catch {}
  return "both";
}

function loadAiPanelWidth(): number {
  try {
    const stored = localStorage.getItem("codrift:aiPanelWidth");
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch {}
  return 520;
}

function sidebarViewStorageKey(path: string) {
  return `codrift:sidebar-view:${path}`;
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

// ── Fast workspace snapshot (localStorage) ──
// Persists a minimal list of workspace IDs/paths so we can show the workspace
// tab bar and begin loading the file tree before the async Tauri DB call
// (load_workspaces) finishes.  The full state is filled in by loadSavedWorkspaces.

const WORKSPACE_SNAPSHOT_KEY = "codrift:workspace-snapshot";

interface WorkspaceSnapshot {
  workspaces: Array<{ id: string; path: string; name: string }>;
  activeWorkspaceId: string | null;
}

function saveWorkspaceSnapshot(workspaces: Workspace[], activeWorkspaceId: string | null) {
  try {
    const snapshot: WorkspaceSnapshot = {
      workspaces: workspaces.map((w) => ({ id: w.id, path: w.path, name: w.name })),
      activeWorkspaceId,
    };
    localStorage.setItem(WORKSPACE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {}
}

function loadWorkspaceSnapshot(): { workspaces: Workspace[]; activeWorkspaceId: string | null } {
  try {
    const raw = localStorage.getItem(WORKSPACE_SNAPSHOT_KEY);
    if (!raw) return { workspaces: [], activeWorkspaceId: null };
    const snapshot: WorkspaceSnapshot = JSON.parse(raw);
    const workspaces = snapshot.workspaces.map((s) => createWorkspace(s.id, s.path, s.name));
    return { workspaces, activeWorkspaceId: snapshot.activeWorkspaceId };
  } catch {
    return { workspaces: [], activeWorkspaceId: null };
  }
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
    closedTabHistory: [],
    recentFiles: [],
    layoutMode: loadLayoutMode(),
    focusMode: loadFocusMode(),
    aiPanelWidth: loadAiPanelWidth(),
  };
}

interface AppState {
  // Global
  theme: Theme;
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  persistWorkspaces: boolean;
  // Settings overlay
  settingsOpen: boolean;
  settingsPage: SettingsPage;
  openSettings: (page?: SettingsPage) => void;
  closeSettings: () => void;
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
  setSettingsPage: (page: SettingsPage) => void;

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
  setLayoutMode: (mode: LayoutMode) => void;
  setFocusMode: (mode: FocusMode) => void;
  setWsAiPanelWidth: (width: number) => void;
  cycleFocusMode: () => void;

  // Per-workspace editor actions
  openFile: (
    path: string,
    name: string,
    preview?: boolean,
    cursorLine?: number,
    cursorCol?: number,
  ) => void;
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
  pinTab: (idx: number) => void;
  unpinTab: (idx: number) => void;
  reopenClosedTab: () => void;
  addRecentFile: (path: string, name: string) => void;

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
  settingsOpen: false,
  settingsPage: "general" as SettingsPage,
  openSettings: (page = "general") => set({ settingsOpen: true, settingsPage: page }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsPage: (page) => set({ settingsPage: page }),
  diagnostics: {},
  diagnosticSummary: { errors: 0, warnings: 0 },
  setDiagnosticsForUri: (uri, diags) =>
    set((s) => {
      // Incremental update: subtract old counts for this URI, add new counts.
      // Avoids an O(total_diags) full scan on every file's diagnostics change.
      const old = s.diagnostics[uri] ?? [];
      let { errors, warnings } = s.diagnosticSummary;
      for (const e of old) {
        if (e.severity === 1) errors -= 1;
        else if (e.severity === 2) warnings -= 1;
      }
      for (const e of diags) {
        if (e.severity === 1) errors += 1;
        else if (e.severity === 2) warnings += 1;
      }
      return {
        diagnostics: { ...s.diagnostics, [uri]: diags },
        diagnosticSummary: { errors: Math.max(0, errors), warnings: Math.max(0, warnings) },
      };
    }),
  // Pre-populate from localStorage snapshot so workspaces appear immediately
  // (before the async Tauri DB load completes).
  ...loadWorkspaceSnapshot(),

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
      const activeWorkspaceId = activeWs?.id ?? workspaces[0]?.id ?? null;
      // Refresh the fast snapshot so the next cold start pre-populates correctly
      saveWorkspaceSnapshot(workspaces, activeWorkspaceId);
      set({ workspaces, activeWorkspaceId });
    } catch {
      // DB might not have the table yet on first run
    }
  },

  saveCurrentWorkspaces: async () => {
    const { workspaces, activeWorkspaceId } = get();
    // Save a fast localStorage snapshot first so it is available synchronously
    // on the next app start (before the async DB call returns).
    saveWorkspaceSnapshot(workspaces, activeWorkspaceId);
    try {
      await invoke("save_workspaces", {
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          path: ws.path,
          name: ws.name,
          position: 0,
          is_active: ws.id === activeWorkspaceId,
          open_files: ws.openFiles
            .filter((f) => !f.deleted)
            .map((f, i) => ({
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
  setLayoutMode: (mode) =>
    set((s) => {
      try {
        localStorage.setItem("codrift:layoutMode", mode);
      } catch {}
      return updateWs(s, () => ({ layoutMode: mode }));
    }),
  setFocusMode: (mode) =>
    set((s) => {
      try {
        localStorage.setItem("codrift:focusMode", mode);
      } catch {}
      return updateWs(s, () => ({ focusMode: mode }));
    }),
  setWsAiPanelWidth: (width) =>
    set((s) => {
      try {
        localStorage.setItem("codrift:aiPanelWidth", String(width));
      } catch {}
      return updateWs(s, () => ({ aiPanelWidth: width }));
    }),
  cycleFocusMode: () =>
    set((s) => {
      const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
      const current = ws?.focusMode ?? "both";
      const next: FocusMode =
        current === "both" ? "ai-only" : current === "ai-only" ? "editor-only" : "both";
      try {
        localStorage.setItem("codrift:focusMode", next);
      } catch {}
      return updateWs(s, () => ({ focusMode: next }));
    }),

  // ── Per-workspace editor ──

  addRecentFile: (path, name) =>
    set((s) =>
      updateWs(s, (ws) => {
        const filtered = ws.recentFiles.filter((f) => f.path !== path);
        return { recentFiles: [{ path, name }, ...filtered].slice(0, 20) };
      }),
    ),

  openFile: (path, name, preview = false, cursorLine = 0, cursorCol = 0) => {
    get().addRecentFile(path, name);
    set((s) => {
      if (s.workspaces.length === 0) {
        const id = `ws-${Date.now()}`;
        const ws = createWorkspace(id, "", "Untitled");
        const newFile: OpenFile = {
          path,
          name,
          modified: false,
          preview,
          cursorLine,
          cursorCol,
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
          // File already open — switch to it and apply cursor if provided
          return {
            activeFileIdx: existing,
            openFiles: openFiles.map((f, i) => {
              if (i !== existing) return f;
              const updated = preview ? f : { ...f, preview: false };
              if (cursorLine > 0) return { ...updated, cursorLine, cursorCol };
              return updated;
            }),
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
              cursorLine,
              cursorCol,
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
              cursorLine,
              cursorCol,
              scrollTop: 0,
              deleted: false,
            },
          ],
          activeFileIdx: openFiles.length,
        };
      });
    });
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  closeFile: (idx) => {
    set((s) =>
      updateWs(s, (ws) => {
        const file = ws.openFiles[idx];
        if (!file || file.pinned) return {}; // Cannot close pinned tabs
        const MAX_HISTORY = 20;
        const closedTabHistory = [file, ...ws.closedTabHistory].slice(0, MAX_HISTORY);
        const updated = ws.openFiles.filter((_, i) => i !== idx);
        let newActive = ws.activeFileIdx;
        if (idx === ws.activeFileIdx) newActive = Math.min(idx, updated.length - 1);
        else if (idx < ws.activeFileIdx) newActive = ws.activeFileIdx - 1;
        return { openFiles: updated, activeFileIdx: newActive, closedTabHistory };
      }),
    );
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  closeAllFiles: () => {
    set((s) =>
      updateWs(s, (ws) => {
        const pinned = ws.openFiles.filter((f) => f.pinned);
        const closed = ws.openFiles.filter((f) => !f.pinned);
        const MAX_HISTORY = 20;
        const closedTabHistory = [...closed, ...ws.closedTabHistory].slice(0, MAX_HISTORY);
        const newActive = pinned.length > 0 ? 0 : -1;
        return { openFiles: pinned, activeFileIdx: newActive, closedTabHistory };
      }),
    );
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  closeOtherFiles: (idx) => {
    set((s) =>
      updateWs(s, (ws) => {
        const target = ws.openFiles[idx];
        if (!target) return { openFiles: [], activeFileIdx: -1 };
        // Keep pinned tabs + the target tab
        const kept = ws.openFiles.filter((f, i) => f.pinned || i === idx);
        const newActiveIdx = kept.findIndex((f) => f.path === target.path);
        const closed = ws.openFiles.filter((f, i) => !f.pinned && i !== idx);
        const MAX_HISTORY = 20;
        const closedTabHistory = [...closed, ...ws.closedTabHistory].slice(0, MAX_HISTORY);
        return {
          openFiles: kept,
          activeFileIdx: newActiveIdx >= 0 ? newActiveIdx : 0,
          closedTabHistory,
        };
      }),
    );
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  setActiveFile: (idx) => {
    set((s) => updateWs(s, () => ({ activeFileIdx: idx })));
    if (get().persistWorkspaces) get().saveCurrentWorkspaces();
  },

  markModified: (path, modified) =>
    set((s) =>
      updateWs(s, (ws) => ({
        openFiles: ws.openFiles.map((f) =>
          f.path === path ? { ...f, modified, ...(modified ? { preview: false } : {}) } : f,
        ),
      })),
    ),

  updateFileState: (path, fileState) => {
    let changed = false;
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
        changed = true;
        const openFiles = [...ws.openFiles];
        openFiles[index] = {
          ...current,
          cursorLine: nextCursorLine,
          cursorCol: nextCursorCol,
          scrollTop: nextScrollTop,
        };
        return { openFiles };
      }),
    );
    if (changed && get().persistWorkspaces) {
      debouncedSave(() => { if (get().persistWorkspaces) get().saveCurrentWorkspaces(); });
    }
  },

  markFileDeleted: (path) =>
    set((s) =>
      updateWs(s, (ws) => ({
        openFiles: ws.openFiles.map((f) => (f.path === path ? { ...f, deleted: true } : f)),
      })),
    ),

  pinTab: (idx) =>
    set((s) =>
      updateWs(s, (ws) => {
        const file = ws.openFiles[idx];
        if (!file || file.pinned) return {};
        // Move pinned tab to front (before unpinned tabs)
        const withoutFile = ws.openFiles.filter((_, i) => i !== idx);
        const insertAt = withoutFile.filter((f) => f.pinned).length;
        const openFiles = [
          ...withoutFile.slice(0, insertAt),
          { ...file, pinned: true, preview: false },
          ...withoutFile.slice(insertAt),
        ];
        const newActiveIdx = openFiles.findIndex((f) => f.path === file.path);
        return { openFiles, activeFileIdx: newActiveIdx };
      }),
    ),

  unpinTab: (idx) =>
    set((s) =>
      updateWs(s, (ws) => {
        const file = ws.openFiles[idx];
        if (!file || !file.pinned) return {};
        const openFiles = ws.openFiles.map((f, i) => (i === idx ? { ...f, pinned: false } : f));
        return { openFiles };
      }),
    ),

  reopenClosedTab: () =>
    set((s) =>
      updateWs(s, (ws) => {
        if (ws.closedTabHistory.length === 0) return {};
        const [tab, ...rest] = ws.closedTabHistory;
        // Check if already open
        const existing = ws.openFiles.findIndex((f) => f.path === tab.path);
        if (existing !== -1) {
          return { closedTabHistory: rest, activeFileIdx: existing };
        }
        const openFiles = [...ws.openFiles, { ...tab, preview: false }];
        return {
          openFiles,
          activeFileIdx: openFiles.length - 1,
          closedTabHistory: rest,
        };
      }),
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
