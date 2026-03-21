import { create } from "zustand";

export interface OpenFile {
  path: string;
  name: string;
  language: string;
  modified: boolean;
  preview: boolean; // preview tabs get replaced on next single-click open
}

export interface WorkspaceState {
  // Identity
  path: string;
  name: string;

  // Files
  openFiles: OpenFile[];
  activeFileIdx: number;

  // Git
  gitBranch: string | null;

  // AI
  chatThreadId: string | null;

  // Actions
  openFile: (file: Omit<OpenFile, "modified" | "preview">, preview?: boolean) => void;
  closeFile: (idx: number) => void;
  closeAllFiles: () => void;
  setActiveFile: (idx: number) => void;
  markModified: (path: string, modified: boolean) => void;
  pinPreview: (idx: number) => void;
  setGitBranch: (branch: string | null) => void;
  setChatThread: (id: string | null) => void;
}

export function createWorkspaceStore(workspacePath: string, workspaceName: string) {
  return create<WorkspaceState>((set, get) => ({
    path: workspacePath,
    name: workspaceName,
    openFiles: [],
    activeFileIdx: -1,
    gitBranch: null,
    chatThreadId: null,

    openFile: (file, preview = false) => {
      const { openFiles } = get();
      const existing = openFiles.findIndex((f) => f.path === file.path);

      if (existing !== -1) {
        // Already open — just activate
        set({ activeFileIdx: existing });
        return;
      }

      // If preview, replace current preview tab
      if (preview) {
        const previewIdx = openFiles.findIndex((f) => f.preview);
        if (previewIdx !== -1) {
          const updated = [...openFiles];
          updated[previewIdx] = { ...file, modified: false, preview: true };
          set({ openFiles: updated, activeFileIdx: previewIdx });
          return;
        }
      }

      // Add new tab
      const newFile: OpenFile = { ...file, modified: false, preview };
      set({ openFiles: [...openFiles, newFile], activeFileIdx: openFiles.length });
    },

    closeFile: (idx) => {
      const { openFiles, activeFileIdx } = get();
      const updated = openFiles.filter((_, i) => i !== idx);
      let newActive = activeFileIdx;
      if (idx === activeFileIdx) {
        newActive = Math.min(idx, updated.length - 1);
      } else if (idx < activeFileIdx) {
        newActive = activeFileIdx - 1;
      }
      set({ openFiles: updated, activeFileIdx: newActive });
    },

    closeAllFiles: () => set({ openFiles: [], activeFileIdx: -1 }),

    setActiveFile: (idx) => set({ activeFileIdx: idx }),

    markModified: (path, modified) =>
      set((s) => ({
        openFiles: s.openFiles.map((f) => (f.path === path ? { ...f, modified } : f)),
      })),

    pinPreview: (idx) =>
      set((s) => ({
        openFiles: s.openFiles.map((f, i) => (i === idx ? { ...f, preview: false } : f)),
      })),

    setGitBranch: (branch) => set({ gitBranch: branch }),
    setChatThread: (id) => set({ chatThreadId: id }),
  }));
}
