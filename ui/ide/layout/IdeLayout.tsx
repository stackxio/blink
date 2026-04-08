import { useCallback, useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store";
import { loadBindings, loadKeymap, matchesKey, effectiveKey } from "@/lib/key-bindings";
import Titlebar from "./Titlebar";
import ActivityBar from "./ActivityBar";
import TabBar from "./TabBar";
import PanelResizer from "./PanelResizer";
import IdeStatusBar from "./IdeStatusBar";
import FileTree, { type FileTreeHandle } from "@/ide/explorer/FileTree";
import { ChevronsDownUp, FilePlus, FolderPlus, SplitSquareHorizontal, X } from "lucide-react";
import FileSearch from "@/ide/explorer/FileSearch";
import Editor from "@/ide/editor/Editor";
import { FileViewer, isViewableFile } from "@/ide/editor/FileViewer";
import TerminalPanel from "@/ide/terminal/TerminalPanel";
import ProblemsPanel from "@/ide/problems/ProblemsPanel";
import BlinkCodePanel from "@/ai/BlinkCodePanel";
import GitPanel from "@/ide/git/GitPanel";
import SearchPanel, { type SearchPanelHandle } from "@/ide/search/SearchPanel";
import LocalHistoryPanel from "@/ide/history/LocalHistoryPanel";
import CommandPalette from "./CommandPalette";
import RecentFilesPopup from "./RecentFilesPopup";
import Breadcrumbs from "@/ide/editor/Breadcrumbs";
import MarkdownPreview from "@/ide/editor/MarkdownPreview";
import { BookOpen } from "lucide-react";

export default function IdeLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const toggleSidePanel = useAppStore((s) => s.toggleSidePanel);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);
  const setWsAiPanelWidth = useAppStore((s) => s.setWsAiPanelWidth);
  const addWorkspace = useAppStore((s) => s.addWorkspace);
  const openFile = useAppStore((s) => s.openFile);
  const closeFile = useAppStore((s) => s.closeFile);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const markModified = useAppStore((s) => s.markModified);
  const updateFileState = useAppStore((s) => s.updateFileState);
  const markFileDeleted = useAppStore((s) => s.markFileDeleted);
  const closeAllFiles = useAppStore((s) => s.closeAllFiles);
  const closeOtherFiles = useAppStore((s) => s.closeOtherFiles);
  const pinTab = useAppStore((s) => s.pinTab);
  const unpinTab = useAppStore((s) => s.unpinTab);
  const reopenClosedTab = useAppStore((s) => s.reopenClosedTab);
  const openFileSplit = useAppStore((s) => s.openFileSplit);
  const closeFileSplit = useAppStore((s) => s.closeFileSplit);
  const setActiveSplitFile = useAppStore((s) => s.setActiveSplitFile);
  const closeSplit = useAppStore((s) => s.closeSplit);
  const setSidePanelWidth = useAppStore((s) => s.setSidePanelWidth);
  const setBottomPanelHeight = useAppStore((s) => s.setBottomPanelHeight);
  const loadSavedWorkspaces = useAppStore((s) => s.loadSavedWorkspaces);
  const openSettings = useAppStore((s) => s.openSettings);
  const settingsOpen = useAppStore((s) => s.settingsOpen);

  const ws = useAppStore((s) => s.activeWorkspace());
  const workspacePath = ws?.path ?? null;
  const workspaceName = ws?.name ?? "Codrift";
  const openFiles = ws?.openFiles ?? [];
  const activeFileIdx = ws?.activeFileIdx ?? -1;
  const closedTabHistory = ws?.closedTabHistory ?? [];
  const splitFiles = ws?.splitFiles ?? [];
  const splitActiveIdx = ws?.splitActiveIdx ?? -1;
  const splitOpen = ws?.splitOpen ?? false;
  const sidePanelOpen = ws?.sidePanelOpen ?? true;
  const sidePanelWidth = ws?.sidePanelWidth ?? 260;
  const bottomPanelOpen = ws?.bottomPanelOpen ?? false;
  const bottomPanelHeight = ws?.bottomPanelHeight ?? 200;
  const bottomPanelTab = ws?.bottomPanelTab ?? "terminal";
  const sidePanelView = ws?.sidePanelView ?? "explorer";
  const layoutMode = ws?.layoutMode ?? "ai-center";
  const focusMode = ws?.focusMode ?? "both";
  const wsAiPanelWidth = ws?.aiPanelWidth ?? 520;
  const setBottomPanelTab = useAppStore((s) => s.setBottomPanelTab);
  const diagnosticSummary = useAppStore((s) => s.diagnosticSummary);
  const errorCount = diagnosticSummary.errors;
  const warningCount = diagnosticSummary.warnings;

  const setSidePanelView = useAppStore((s) => s.setSidePanelView);

  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [mdPreview, setMdPreview] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [recentFilesOpen, setRecentFilesOpen] = useState(false);
  const [symbolSearchMode, setSymbolSearchMode] = useState<"document" | "workspace" | null>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [liveCursor, setLiveCursor] = useState<{ line?: number; col?: number }>({});
  const fileContentCacheRef = useRef(new Map<string, string>());
  const pendingFileStateRef = useRef<{
    path: string;
    state: { cursorLine?: number; cursorCol?: number; scrollTop?: number };
  } | null>(null);
  const fileStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const searchPanelRef = useRef<SearchPanelHandle>(null);

  // Load saved workspaces on mount, then check for a CLI startup path.
  // Must be sequential: loadSavedWorkspaces replaces the workspaces array,
  // so opening the startup file before that finishes would be overwritten.
  useEffect(() => {
    loadSavedWorkspaces()
      .then(() => invoke<string | null>("get_startup_path"))
      .then((path) => {
        if (!path) return;
        // Determine if it's a directory (open as workspace) or a file (open in editor)
        invoke<boolean>("is_dir", { path })
          .then((isDir) => {
            if (isDir) {
              const name = path.split("/").pop() || path;
              addWorkspace(path, name);
            } else {
              const name = path.split("/").pop() || path;
              openFile(path, name, false);
            }
          })
          .catch(() => {
            // Fallback: try opening as a file
            const name = path.split("/").pop() || path;
            openFile(path, name, false);
          });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  // Listen for native menu navigation events (settings, extensions)
  useEffect(() => {
    function onNavigate(e: Event) {
      const path = (e as CustomEvent<string>).detail;
      if (path === "/settings") {
        openSettings();
      } else if (path) {
        navigate(path);
      }
    }
    function onFileSearch() {
      setFileSearchOpen((v) => !v);
    }
    function onOpenFile(e: Event) {
      const { path, name } = (e as CustomEvent<{ path: string; name: string }>).detail;
      if (path) {
        openFile(path, name || path.split("/").pop() || path, false);
        if (location.pathname !== "/") navigate("/");
      }
    }
    function onLaunchCliTerminal() {
      // Open the bottom panel to the terminal tab so TerminalPanel is mounted and handles the event
      if (!useAppStore.getState().activeWorkspace()?.bottomPanelOpen) {
        toggleBottomPanel();
      }
      setBottomPanelTab("terminal");
    }
    document.addEventListener("blink:navigate", onNavigate);
    document.addEventListener("blink:file-search", onFileSearch);
    document.addEventListener("blink:open-file", onOpenFile);
    document.addEventListener("blink:launch-cli-terminal", onLaunchCliTerminal);
    return () => {
      document.removeEventListener("blink:navigate", onNavigate);
      document.removeEventListener("blink:file-search", onFileSearch);
      document.removeEventListener("blink:open-file", onOpenFile);
      document.removeEventListener("blink:launch-cli-terminal", onLaunchCliTerminal);
    };
  }, [navigate, openSettings]);

  // Fetch git branch for status bar
  useEffect(() => {
    if (!workspacePath) {
      setGitBranch(null);
      return;
    }
    let cancelled = false;
    const fetchBranch = () => {
      invoke<string>("git_branch", { path: workspacePath })
        .then((b) => {
          if (!cancelled) setGitBranch(b);
        })
        .catch(() => {
          if (!cancelled) setGitBranch(null);
        });
    };
    fetchBranch();

    function onGitRefresh() {
      fetchBranch();
    }
    function onFocusRefresh() {
      if (!document.hidden) fetchBranch();
    }
    document.addEventListener("blink:git-refresh", onGitRefresh);
    window.addEventListener("focus", onFocusRefresh);
    document.addEventListener("visibilitychange", onFocusRefresh);
    return () => {
      cancelled = true;
      document.removeEventListener("blink:git-refresh", onGitRefresh);
      window.removeEventListener("focus", onFocusRefresh);
      document.removeEventListener("visibilitychange", onFocusRefresh);
    };
  }, [workspacePath]);

  // Start file watcher when workspace opens
  useEffect(() => {
    if (!workspacePath) return;
    invoke("start_watching", { path: workspacePath }).catch(() => {});
    return () => {
      invoke("stop_watching").catch(() => {});
    };
  }, [workspacePath]);

  // Listen for external file changes and reload open files + refresh file tree
  useEffect(() => {
    const unlisten = listen<string>("file:changed", (event) => {
      const changedPath = event.payload;
      const ws = useAppStore.getState().activeWorkspace();
      if (!ws) return;

      fileTreeRef.current?.refreshPath(changedPath);

      const fileEntry = ws.openFiles.find((f) => f.path === changedPath);
      if (!fileEntry) return;
      // Don't reload if user has unsaved changes
      if (fileEntry.modified) return;
      const isActive = ws.openFiles[ws.activeFileIdx]?.path === changedPath;
      // Always bust the cache so switching to this tab shows fresh content
      invoke<string>("read_file_content", { path: changedPath })
        .then((content) => {
          fileContentCacheRef.current.set(changedPath, content);
          if (isActive) setFileContent(content);
        })
        .catch(() => {});
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Active file
  const activeFile =
    activeFileIdx >= 0 && activeFileIdx < openFiles.length ? openFiles[activeFileIdx] : null;

  // File content
  const [fileContent, setFileContent] = useState<string>("");

  const flushPendingFileState = useCallback(() => {
    const pending = pendingFileStateRef.current;
    if (!pending) return;
    pendingFileStateRef.current = null;
    updateFileState(pending.path, pending.state);
  }, [updateFileState]);

  useEffect(() => {
    setLiveCursor({
      line: activeFile?.cursorLine || undefined,
      col: activeFile?.cursorCol || undefined,
    });
  }, [activeFile?.path, activeFile?.cursorLine, activeFile?.cursorCol]);

  useEffect(() => {
    flushPendingFileState();
    return () => {
      if (fileStateTimerRef.current) {
        clearTimeout(fileStateTimerRef.current);
        fileStateTimerRef.current = null;
      }
      flushPendingFileState();
    };
  }, [activeFile?.path, flushPendingFileState]);

  const handleSideResize = useCallback(
    (delta: number) => setSidePanelWidth(Math.max(180, Math.min(480, sidePanelWidth + delta))),
    [sidePanelWidth, setSidePanelWidth],
  );

  const handleAiResize = useCallback(
    (delta: number) => {
      // In ai-center mode the resizer sits on the RIGHT edge of the AI panel,
      // so dragging right (positive delta) should grow the panel.
      // In editor-center mode the resizer sits on the LEFT edge, so invert.
      const d = layoutMode === "ai-center" ? delta : -delta;
      setWsAiPanelWidth(Math.max(300, Math.min(window.innerWidth - 200, wsAiPanelWidth + d)));
    },
    [wsAiPanelWidth, setWsAiPanelWidth, layoutMode],
  );

  const handleBottomResize = useCallback(
    (delta: number) =>
      setBottomPanelHeight(Math.max(100, Math.min(500, bottomPanelHeight - delta))),
    [bottomPanelHeight, setBottomPanelHeight],
  );

  async function handleOpenFolder() {
    try {
      const path = await invoke<string | null>("open_folder_dialog");
      if (path) {
        const name = path.split("/").pop() || path;
        addWorkspace(path, name);
      }
    } catch {}
  }

  function handleFileSelect(path: string, name: string, preview: boolean) {
    openFile(path, name, preview);
    if (location.pathname !== "/") navigate("/");
  }

  async function handleFileSave(content: string) {
    if (!activeFile) return;
    try {
      await invoke("write_file_content", { path: activeFile.path, content });
      fileContentCacheRef.current.set(activeFile.path, content);
      markModified(activeFile.path, false);
      // Snapshot local history — fire and forget
      invoke("create_local_history_entry", {
        filePath: activeFile.path,
        content,
        maxSnapshots: 50,
      }).catch(() => {});
    } catch {}
  }

  // Unsaved changes confirmation wrappers
  async function handleCloseFile(idx: number) {
    const ws = useAppStore.getState().activeWorkspace();
    if (!ws) return;
    const file = ws.openFiles[idx];
    if (file?.modified) {
      const ok = confirm(`Save changes to ${file.name}?`);
      if (!ok) return;
      // Save the file first
      try {
        const content = await invoke<string>("read_file_content", { path: file.path });
        await invoke("write_file_content", { path: file.path, content });
        markModified(file.path, false);
      } catch {}
    }
    closeFile(idx);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const map = loadBindings();
      const km = loadKeymap();

      // toggle_terminal: Ctrl+` (VS Code) | Alt+F12 (JetBrains)
      if (matchesKey(e, effectiveKey("toggle_terminal", map, km))) {
        e.preventDefault();
        toggleBottomPanel();
        return;
      }
      // toggle_ai_panel: Cmd+L (both keymaps)
      if (matchesKey(e, effectiveKey("toggle_ai_panel", map, km))) {
        e.preventDefault();
        toggleAiPanel();
        return;
      }
      // go_to_file: Cmd+P (VS Code) | Cmd+Shift+O (JetBrains)
      if (matchesKey(e, effectiveKey("go_to_file", map, km))) {
        e.preventDefault();
        setFileSearchOpen((v) => !v);
        return;
      }
      // command_palette: Cmd+Shift+P (VS Code) | Cmd+Shift+A (JetBrains)
      if (matchesKey(e, effectiveKey("command_palette", map, km))) {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      // symbol_search_document: Cmd+Shift+O (VS Code) | Cmd+F12 (JetBrains)
      if (matchesKey(e, effectiveKey("symbol_search_document", map, km))) {
        e.preventDefault();
        setSymbolSearchMode((m) => (m === "document" ? null : "document"));
        return;
      }
      // symbol_search_workspace: Cmd+T (VS Code) | Cmd+Alt+O (JetBrains)
      if (matchesKey(e, effectiveKey("symbol_search_workspace", map, km))) {
        e.preventDefault();
        setSymbolSearchMode((m) => (m === "workspace" ? null : "workspace"));
        return;
      }
      // Cmd+Shift+T — reopen last closed tab (hardcoded, not in keybinding settings)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        reopenClosedTab();
        return;
      }
      // search_in_files: Cmd+Shift+F (same in both keymaps)
      if (matchesKey(e, effectiveKey("search_in_files", map, km))) {
        e.preventDefault();
        const selectedText = window.getSelection()?.toString()?.trim() || "";
        setSidePanelView("search");
        setTimeout(() => searchPanelRef.current?.focusInput(selectedText), 50);
        return;
      }
      // next_tab: Cmd+Tab (VS Code) | Cmd+Tab (JetBrains, same default)
      if (matchesKey(e, effectiveKey("next_tab", map, km))) {
        e.preventDefault();
        const ws = useAppStore.getState().activeWorkspace();
        if (ws && ws.openFiles.length > 1) {
          const count = ws.openFiles.length;
          setActiveFile((ws.activeFileIdx + 1) % count);
        }
        return;
      }
      // previous_tab: Cmd+Shift+Tab (VS Code) | Cmd+Shift+Tab (JetBrains, same default)
      if (matchesKey(e, effectiveKey("previous_tab", map, km))) {
        e.preventDefault();
        const ws = useAppStore.getState().activeWorkspace();
        if (ws && ws.openFiles.length > 1) {
          const count = ws.openFiles.length;
          setActiveFile((ws.activeFileIdx - 1 + count) % count);
        }
        return;
      }
      // close_tab: Cmd+W (same in both)
      if (matchesKey(e, effectiveKey("close_tab", map, km))) {
        e.preventDefault();
        const ws = useAppStore.getState().activeWorkspace();
        if (ws && ws.activeFileIdx >= 0) {
          handleCloseFile(ws.activeFileIdx);
        }
        return;
      }
      // open_file: Cmd+O (same in both)
      if (matchesKey(e, effectiveKey("open_file", map, km))) {
        e.preventDefault();
        invoke<string[]>("open_file_dialog")
          .then((paths) => {
            for (const p of paths) {
              const name = p.split("/").pop() || p;
              openFile(p, name, false);
            }
            if (location.pathname !== "/") navigate("/");
          })
          .catch(() => {});
        return;
      }
      // toggle_sidebar: Cmd+B (VS Code) | Cmd+1 (JetBrains)
      // Check before workspace digit switch so JetBrains Cmd+1 toggles sidebar, not workspace
      if (matchesKey(e, effectiveKey("toggle_sidebar", map, km))) {
        e.preventDefault();
        toggleSidePanel();
        return;
      }
      // open_settings: Cmd+, (same in both)
      if (matchesKey(e, effectiveKey("open_settings", map, km))) {
        e.preventDefault();
        openSettings();
        return;
      }
      // Cmd+E — recent files (JetBrains style)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "e") {
        e.preventDefault();
        setRecentFilesOpen((v) => !v);
        return;
      }

      // Cmd+1–9 — switch to workspace by index
      // In JetBrains mode, Cmd+1 = toggle_sidebar (already handled above, so won't reach here for 1)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 1 && digit <= 9) {
          const state = useAppStore.getState();
          const target = state.workspaces[digit - 1];
          if (target) {
            e.preventDefault();
            state.setActiveWorkspace(target.id);
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyboard handler uses refs and store getState(), doesn't need all deps
  }, [navigate, openSettings, toggleAiPanel, toggleBottomPanel, toggleSidePanel]);

  useEffect(() => {
    if (!activeFile) {
      setFileContent("");
      return;
    }
    const cached = fileContentCacheRef.current.get(activeFile.path);
    if (cached != null) {
      setFileContent(cached);
    } else {
      setFileContent("");
    }
    let cancelled = false;
    // Binary/viewable files (images, PDFs, CSVs handled by FileViewer) don't
    // need text content — skip the read so we don't wrongly mark them deleted.
    if (isViewableFile(activeFile.name))
      return () => {
        cancelled = true;
      };
    invoke<string>("read_file_content", { path: activeFile.path })
      .then((content) => {
        fileContentCacheRef.current.set(activeFile.path, content);
        if (!cancelled) setFileContent(content);
      })
      .catch(() => {
        if (!cancelled) {
          setFileContent("");
          markFileDeleted(activeFile.path);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when file path changes
  }, [activeFile?.path]);

  function handleCloseAllFiles() {
    const ws = useAppStore.getState().activeWorkspace();
    if (!ws) return;
    const hasModified = ws.openFiles.some((f) => f.modified);
    if (hasModified) {
      const ok = confirm("Save all unsaved changes before closing?");
      if (!ok) return;
    }
    closeAllFiles();
  }

  function handleCloseOtherFiles(idx: number) {
    const ws = useAppStore.getState().activeWorkspace();
    if (!ws) return;
    const hasModified = ws.openFiles.some((f, i) => i !== idx && f.modified);
    if (hasModified) {
      const ok = confirm("Save unsaved changes in other files before closing?");
      if (!ok) return;
    }
    closeOtherFiles(idx);
  }

  function getLanguage(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = {
      js: "JavaScript",
      jsx: "JavaScript",
      ts: "TypeScript",
      tsx: "TypeScript",
      py: "Python",
      rs: "Rust",
      go: "Go",
      html: "HTML",
      css: "CSS",
      scss: "SCSS",
      json: "JSON",
      md: "Markdown",
      yaml: "YAML",
      yml: "YAML",
      toml: "TOML",
      sh: "Shell",
      bash: "Shell",
      zsh: "Shell",
    };
    return map[ext] || ext.toUpperCase() || "Plain Text";
  }

  const isEditorActive = activeFile && !settingsOpen;

  const workspaceClasses = [
    "ide__workspace",
    `ide__workspace--${layoutMode}`,
    focusMode === "ai-only" ? "ide__workspace--focus-ai" : "",
    focusMode === "editor-only" ? "ide__workspace--focus-editor" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ide">
      {/* Titlebar with workspace tabs */}
      <div className="ide__titlebar">
        <Titlebar />
      </div>

      {/* Activity bar */}
      <div className="ide__activity-bar">
        <ActivityBar />
      </div>

      {/* Side panel */}
      {sidePanelOpen && (
        <div className="ide__side-panel" style={{ width: sidePanelWidth }}>
          <div className="side-panel">
            {sidePanelView === "git" ? (
              <>
                <div className="side-panel__header">
                  <span className="side-panel__title">Source Control</span>
                </div>
                <div className="side-panel__body">
                  <GitPanel
                    workspacePath={workspacePath}
                    onFileSelect={(path, name) => handleFileSelect(path, name, false)}
                  />
                </div>
              </>
            ) : sidePanelView === "search" ? (
              <>
                <div className="side-panel__header">
                  <span className="side-panel__title">Search</span>
                </div>
                <div className="side-panel__body">
                  <SearchPanel
                    ref={searchPanelRef}
                    workspacePath={workspacePath}
                    onOpenFile={(path, name) => handleFileSelect(path, name, false)}
                  />
                </div>
              </>
            ) : sidePanelView === "history" ? (
              <>
                <div className="side-panel__header">
                  <span className="side-panel__title">Local History</span>
                </div>
                <div className="side-panel__body">
                  <LocalHistoryPanel
                    filePath={activeFile?.path ?? null}
                    onRestore={(content, filePath) => {
                      fileContentCacheRef.current.set(filePath, content);
                      if (activeFile?.path === filePath) {
                        setFileContent(content);
                        markModified(filePath, false);
                      }
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="side-panel__header">
                  <span className="side-panel__title">Explorer</span>
                  <div className="side-panel__actions">
                    <button
                      type="button"
                      className="side-panel__action-btn"
                      onClick={() => fileTreeRef.current?.newFile()}
                      title="New File"
                    >
                      <FilePlus size={14} />
                    </button>
                    <button
                      type="button"
                      className="side-panel__action-btn"
                      onClick={() => fileTreeRef.current?.newFolder()}
                      title="New Folder"
                    >
                      <FolderPlus size={14} />
                    </button>
                    <button
                      type="button"
                      className="side-panel__action-btn"
                      onClick={() => fileTreeRef.current?.collapseAll()}
                      title="Collapse All"
                    >
                      <ChevronsDownUp size={14} />
                    </button>
                  </div>
                </div>
                <div className="side-panel__body">
                  <FileTree
                    ref={fileTreeRef}
                    rootPath={workspacePath}
                    onOpenFolder={handleOpenFolder}
                    onFileSelect={handleFileSelect}
                    activeFilePath={activeFile?.path ?? null}
                  />
                </div>
              </>
            )}
          </div>
          <PanelResizer onResize={handleSideResize} />
        </div>
      )}

      {/* Main area */}
      <div className="ide__main">
        <div className={workspaceClasses}>
          {/* Editor column (editor area + bottom panel) */}
          <div className="ide__editor-col">
            <div className={`ide__editor-area${splitOpen ? " ide__editor-area--split" : ""}`}>
              {/* Primary pane */}
              <div className="editor-pane-wrap">
                <TabBar
                  files={openFiles}
                  activeIdx={activeFileIdx}
                  workspacePath={workspacePath}
                  onSelect={setActiveFile}
                  onClose={handleCloseFile}
                  onCloseAll={handleCloseAllFiles}
                  onCloseOthers={handleCloseOtherFiles}
                  onPin={pinTab}
                  onUnpin={unpinTab}
                  onReopenClosed={reopenClosedTab}
                  hasClosedHistory={closedTabHistory.length > 0}
                />
                {isEditorActive && activeFile && (
                  <div className="breadcrumbs-row">
                    <Breadcrumbs
                      filePath={activeFile.path}
                      workspacePath={workspacePath}
                      onFolderClick={(path) => {
                        setSidePanelView("explorer");
                        if (!sidePanelOpen) toggleSidePanel();
                        setTimeout(() => fileTreeRef.current?.refreshPath(path), 50);
                      }}
                    />
                    <div className="breadcrumbs-row__actions">
                      {activeFile.name.endsWith(".md") && (
                        <button
                          type="button"
                          className={`md-toggle ${mdPreview ? "md-toggle--active" : ""}`}
                          onClick={() => setMdPreview((v) => !v)}
                          title="Toggle Markdown Preview"
                        >
                          <BookOpen size={13} />
                          Preview
                        </button>
                      )}
                      {!splitOpen && (
                        <button
                          type="button"
                          className="breadcrumbs-row__btn"
                          title="Split Right"
                          onClick={() => openFileSplit(activeFile.path, activeFile.name)}
                        >
                          <SplitSquareHorizontal size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div
                  style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}
                >
                  {isEditorActive ? (
                    <div
                      className={mdPreview && activeFile.name.endsWith(".md") ? "md-split" : ""}
                      style={{ flex: 1, display: "flex", overflow: "hidden" }}
                    >
                      <div
                        className="md-split__editor"
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {isViewableFile(activeFile.name) ? (
                          <FileViewer
                            filePath={activeFile.path}
                            filename={activeFile.name}
                            content={fileContent}
                          />
                        ) : (
                          <Editor
                            content={fileContent}
                            filename={activeFile.name}
                            filePath={activeFile.path}
                            initialCursorLine={activeFile.cursorLine}
                            initialCursorCol={activeFile.cursorCol}
                            initialScrollTop={activeFile.scrollTop}
                            onSave={handleFileSave}
                            onChange={(mod) => markModified(activeFile.path, mod)}
                            onCursorChange={(line, col, scroll) => {
                              setLiveCursor({ line, col });
                              pendingFileStateRef.current = {
                                path: activeFile.path,
                                state: {
                                  cursorLine: line,
                                  cursorCol: col,
                                  scrollTop: scroll,
                                },
                              };
                              if (fileStateTimerRef.current) {
                                clearTimeout(fileStateTimerRef.current);
                              }
                              fileStateTimerRef.current = setTimeout(() => {
                                fileStateTimerRef.current = null;
                                flushPendingFileState();
                              }, 120);
                            }}
                            onNavigate={(path, line, col) => {
                              const name = path.split("/").pop() || path;
                              openFile(path, name, false, line, col);
                            }}
                            symbolSearchMode={symbolSearchMode}
                            onSymbolSearchClose={() => setSymbolSearchMode(null)}
                          />
                        )}
                      </div>
                      {mdPreview && activeFile.name.endsWith(".md") && (
                        <div className="md-split__preview">
                          <MarkdownPreview content={fileContent} />
                        </div>
                      )}
                    </div>
                  ) : workspacePath ? (
                    <div className="empty-state">
                      <p className="empty-state__text">
                        Select a file from the explorer to start editing
                      </p>
                    </div>
                  ) : (
                    <Outlet />
                  )}
                </div>
              </div>

              {/* Split pane */}
              {splitOpen &&
                (() => {
                  const splitFile =
                    splitActiveIdx >= 0 && splitActiveIdx < splitFiles.length
                      ? splitFiles[splitActiveIdx]
                      : null;
                  return (
                    <>
                      <div className="editor-split-divider" />
                      <div className="editor-pane-wrap">
                        <TabBar
                          files={splitFiles}
                          activeIdx={splitActiveIdx}
                          workspacePath={workspacePath}
                          onSelect={setActiveSplitFile}
                          onClose={closeFileSplit}
                          onCloseAll={closeSplit}
                          onCloseOthers={(idx) => {
                            const keep = splitFiles[idx];
                            if (keep) {
                              closeSplit();
                              openFileSplit(keep.path, keep.name);
                            }
                          }}
                        />
                        {splitFile && (
                          <div className="breadcrumbs-row">
                            <Breadcrumbs filePath={splitFile.path} workspacePath={workspacePath} />
                            <div className="breadcrumbs-row__actions">
                              <button
                                type="button"
                                className="breadcrumbs-row__btn"
                                title="Close Split"
                                onClick={closeSplit}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                        <div
                          style={{
                            flex: 1,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          {splitFile ? (
                            <SplitEditorPane
                              file={splitFile}
                              workspacePath={workspacePath}
                              onSave={async (path, content) => {
                                await invoke("write_file_content", { path, content });
                              }}
                              onModified={(path, mod) => markModified(path, mod)}
                            />
                          ) : (
                            <div className="empty-state">
                              <p className="empty-state__text">Open a file to edit in split view</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
            </div>

            {bottomPanelOpen && (
              <>
                <PanelResizer direction="vertical" onResize={handleBottomResize} />
                <div className="ide__bottom-panel" style={{ height: bottomPanelHeight }}>
                  {/* Tab bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      borderBottom: "1px solid var(--c-border)",
                      background: "var(--c-surface)",
                      flexShrink: 0,
                      height: 32,
                      paddingLeft: 8,
                    }}
                  >
                    {(["terminal", "problems"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setBottomPanelTab(tab)}
                        style={{
                          height: "100%",
                          padding: "0 12px",
                          border: "none",
                          borderBottom:
                            bottomPanelTab === tab
                              ? "2px solid var(--c-accent)"
                              : "2px solid transparent",
                          background: "transparent",
                          color: bottomPanelTab === tab ? "var(--c-fg)" : "var(--c-muted-fg)",
                          fontSize: "var(--font-size-xs)",
                          fontFamily: "inherit",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {tab === "problems" && errorCount + warningCount > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              background: errorCount > 0 ? "var(--c-danger)" : "var(--c-warning)",
                              color: "#fff",
                              borderRadius: 8,
                              padding: "0 5px",
                              lineHeight: "16px",
                            }}
                          >
                            {errorCount + warningCount}
                          </span>
                        )}
                      </button>
                    ))}
                    {/* Close bottom panel — always visible regardless of active tab */}
                    <button
                      type="button"
                      onClick={toggleBottomPanel}
                      title="Close Panel"
                      style={{
                        marginLeft: "auto",
                        marginRight: 6,
                        height: 22,
                        width: 22,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "transparent",
                        border: "none",
                        borderRadius: 4,
                        color: "var(--c-muted-fg)",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-fg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-muted-fg)")}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {/* Panel content */}
                  <div
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      height: "calc(100% - 32px)",
                    }}
                  >
                    {bottomPanelTab === "terminal" ? <TerminalPanel /> : <ProblemsPanel />}
                  </div>
                </div>
              </>
            )}
          </div>
          {/* end ide__editor-col */}

          {/* AI panel */}
          {(aiPanelOpen || focusMode === "ai-only") && (
            <div
              className="ide__ai-panel"
              // In AI-only mode let the panel fill all available space (no fixed width).
              // In normal mode pin it to the saved width.
              style={focusMode === "ai-only" ? undefined : { width: wsAiPanelWidth }}
            >
              {/* Resizer goes on the RIGHT edge in ai-center mode, LEFT in editor-center */}
              {layoutMode !== "ai-center" && <PanelResizer onResize={handleAiResize} />}
              <BlinkCodePanel />
              {layoutMode === "ai-center" && focusMode !== "ai-only" && (
                <PanelResizer onResize={handleAiResize} />
              )}
            </div>
          )}
        </div>
        {/* end ide__workspace */}
      </div>

      {/* File search overlay (Cmd+P) */}
      {fileSearchOpen && workspacePath && (
        <FileSearch
          workspacePath={workspacePath}
          onSelect={(relPath) => {
            const fullPath = `${workspacePath}/${relPath}`;
            const name = relPath.split("/").pop() || relPath;
            openFile(fullPath, name, false);
            if (location.pathname !== "/") navigate("/");
          }}
          onClose={() => setFileSearchOpen(false)}
        />
      )}

      {/* Command palette (Cmd+Shift+P) */}
      {commandPaletteOpen && <CommandPalette onClose={() => setCommandPaletteOpen(false)} />}

      {/* Recent files popup (Cmd+E) */}
      {recentFilesOpen && (
        <RecentFilesPopup
          onOpen={(path, name) => {
            openFile(path, name, false);
            if (location.pathname !== "/") navigate("/");
          }}
          onClose={() => setRecentFilesOpen(false)}
        />
      )}

      {/* Status bar */}
      <div className="ide__status-bar">
        <IdeStatusBar
          branch={gitBranch}
          language={activeFile ? getLanguage(activeFile.name) : undefined}
          line={liveCursor.line}
          col={liveCursor.col}
          workspaceName={workspaceName}
        />
      </div>
    </div>
  );
}

// ── Split pane editor wrapper ──
// Manages its own content state so it doesn't conflict with the primary pane.
function SplitEditorPane({
  file,
  workspacePath: _workspacePath,
  onSave,
  onModified,
}: {
  file: { path: string; name: string; cursorLine: number; cursorCol: number; scrollTop: number };
  workspacePath: string | null;
  onSave: (path: string, content: string) => void;
  onModified: (path: string, mod: boolean) => void;
}) {
  const [content, setContent] = useState("");
  const savedRef = useRef(content);

  useEffect(() => {
    invoke<string>("read_file_content", { path: file.path })
      .then((c) => {
        setContent(c);
        savedRef.current = c;
      })
      .catch(() => {});
  }, [file.path]);

  return (
    <Editor
      content={content}
      filename={file.name}
      filePath={file.path}
      initialCursorLine={file.cursorLine}
      initialCursorCol={file.cursorCol}
      initialScrollTop={file.scrollTop}
      onSave={(c) => {
        onSave(file.path, c);
        savedRef.current = c;
      }}
      onChange={(mod) => onModified(file.path, mod)}
      onCursorChange={() => {}}
    />
  );
}
