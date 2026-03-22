import { useCallback, useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store";
import { loadBindings, matchesKey, effectiveKey } from "@/lib/key-bindings";
import Titlebar from "./Titlebar";
import ActivityBar from "./ActivityBar";
import TabBar from "./TabBar";
import PanelResizer from "./PanelResizer";
import IdeStatusBar from "./IdeStatusBar";
import WorkspaceTabs from "./WorkspaceTabs";
import FileTree, { type FileTreeHandle } from "@/ide/explorer/FileTree";
import { ChevronsDownUp } from "lucide-react";
import FileSearch from "@/ide/explorer/FileSearch";
import Editor from "@/ide/editor/Editor";
import TerminalPanel from "@/ide/terminal/TerminalPanel";
import AiPanel from "@/ai/AiPanel";
import GitPanel from "@/ide/git/GitPanel";
import SearchPanel, { type SearchPanelHandle } from "@/ide/search/SearchPanel";
import CommandPalette from "./CommandPalette";
import Breadcrumbs from "@/ide/editor/Breadcrumbs";

export default function IdeLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const toggleSidePanel = useAppStore((s) => s.toggleSidePanel);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const aiPanelWidth = useAppStore((s) => s.aiPanelWidth);
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);
  const setAiPanelWidth = useAppStore((s) => s.setAiPanelWidth);
  const addWorkspace = useAppStore((s) => s.addWorkspace);
  const openFile = useAppStore((s) => s.openFile);
  const closeFile = useAppStore((s) => s.closeFile);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const markModified = useAppStore((s) => s.markModified);
  const updateFileState = useAppStore((s) => s.updateFileState);
  const markFileDeleted = useAppStore((s) => s.markFileDeleted);
  const closeAllFiles = useAppStore((s) => s.closeAllFiles);
  const closeOtherFiles = useAppStore((s) => s.closeOtherFiles);
  const setSidePanelWidth = useAppStore((s) => s.setSidePanelWidth);
  const setBottomPanelHeight = useAppStore((s) => s.setBottomPanelHeight);
  const loadSavedWorkspaces = useAppStore((s) => s.loadSavedWorkspaces);

  // Active workspace — all layout state comes from here
  const ws = useAppStore((s) => s.activeWorkspace());
  const workspacePath = ws?.path ?? null;
  const workspaceName = ws?.name ?? "Caret";
  const openFiles = ws?.openFiles ?? [];
  const activeFileIdx = ws?.activeFileIdx ?? -1;
  const sidePanelOpen = ws?.sidePanelOpen ?? true;
  const sidePanelWidth = ws?.sidePanelWidth ?? 260;
  const bottomPanelOpen = ws?.bottomPanelOpen ?? false;
  const bottomPanelHeight = ws?.bottomPanelHeight ?? 200;

  const sidePanelView = ws?.sidePanelView ?? "explorer";

  const setSidePanelView = useAppStore((s) => s.setSidePanelView);

  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const searchPanelRef = useRef<SearchPanelHandle>(null);

  // Load saved workspaces on mount
  useEffect(() => {
    loadSavedWorkspaces();
  }, []);

  // Listen for native menu navigation events (settings, extensions)
  useEffect(() => {
    function onNavigate(e: Event) {
      const path = (e as CustomEvent<string>).detail;
      if (path) navigate(path);
    }
    document.addEventListener("caret:navigate", onNavigate);
    return () => document.removeEventListener("caret:navigate", onNavigate);
  }, [navigate]);

  // Fetch git branch for status bar
  useEffect(() => {
    if (!workspacePath) {
      setGitBranch(null);
      return;
    }
    let cancelled = false;
    const fetchBranch = () => {
      invoke<string>("git_branch", { path: workspacePath })
        .then((b) => { if (!cancelled) setGitBranch(b); })
        .catch(() => { if (!cancelled) setGitBranch(null); });
    };
    fetchBranch();
    const interval = setInterval(fetchBranch, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [workspacePath]);

  // Active file
  const activeFile = activeFileIdx >= 0 && activeFileIdx < openFiles.length ? openFiles[activeFileIdx] : null;

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        toggleBottomPanel();
        return;
      }
      // Cmd+L — toggle AI panel
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        toggleAiPanel();
        return;
      }
      // Cmd+Shift+P — command palette / Cmd+P — file search
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        if (e.shiftKey) {
          setCommandPaletteOpen((v) => !v);
        } else if (workspacePath) {
          setFileSearchOpen((v) => !v);
        }
        return;
      }
      // Cmd+Shift+F — focus sidebar search with selected text
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        const selectedText = window.getSelection()?.toString()?.trim() || "";
        setSidePanelView("search");
        setTimeout(() => searchPanelRef.current?.focusInput(selectedText), 50);
        return;
      }
      // Cmd+Tab / Cmd+Shift+Tab — cycle through open files
      if ((e.metaKey || e.ctrlKey) && e.key === "Tab") {
        e.preventDefault();
        const ws = useAppStore.getState().activeWorkspace();
        if (ws && ws.openFiles.length > 1) {
          const count = ws.openFiles.length;
          const nextIdx = e.shiftKey
            ? (ws.activeFileIdx - 1 + count) % count
            : (ws.activeFileIdx + 1) % count;
          setActiveFile(nextIdx);
        }
        return;
      }
      // Cmd+W — close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        const ws = useAppStore.getState().activeWorkspace();
        if (ws && ws.activeFileIdx >= 0) {
          closeFile(ws.activeFileIdx);
        }
        return;
      }
      // Cmd+O — open file
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        invoke<string[]>("open_file_dialog").then((paths) => {
          for (const p of paths) {
            const name = p.split("/").pop() || p;
            openFile(p, name, false);
          }
          if (location.pathname !== "/") navigate("/");
        }).catch(() => {});
        return;
      }
      const map = loadBindings();
      if (matchesKey(e, effectiveKey("toggle_sidebar", map))) {
        e.preventDefault();
        toggleSidePanel();
      } else if (matchesKey(e, effectiveKey("open_settings", map))) {
        e.preventDefault();
        navigate("/settings");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, toggleBottomPanel, toggleSidePanel]);

  // File content
  const [fileContent, setFileContent] = useState<string>("");

  useEffect(() => {
    if (!activeFile) {
      setFileContent("");
      return;
    }
    let cancelled = false;
    invoke<string>("read_file_content", { path: activeFile.path })
      .then((content) => { if (!cancelled) setFileContent(content); })
      .catch(() => {
        if (!cancelled) {
          setFileContent("");
          markFileDeleted(activeFile.path);
        }
      });
    return () => { cancelled = true; };
  }, [activeFile?.path]);

  const handleSideResize = useCallback(
    (delta: number) => setSidePanelWidth(Math.max(180, Math.min(480, sidePanelWidth + delta))),
    [sidePanelWidth, setSidePanelWidth],
  );

  const handleAiResize = useCallback(
    (delta: number) => setAiPanelWidth(Math.max(280, Math.min(800, aiPanelWidth - delta))),
    [aiPanelWidth, setAiPanelWidth],
  );

  const handleBottomResize = useCallback(
    (delta: number) => setBottomPanelHeight(Math.max(100, Math.min(500, bottomPanelHeight - delta))),
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
      markModified(activeFile.path, false);
    } catch {}
  }

  function getLanguage(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = {
      js: "JavaScript", jsx: "JavaScript", ts: "TypeScript", tsx: "TypeScript",
      py: "Python", rs: "Rust", go: "Go", html: "HTML", css: "CSS", scss: "SCSS",
      json: "JSON", md: "Markdown", yaml: "YAML", yml: "YAML", toml: "TOML",
      sh: "Shell", bash: "Shell", zsh: "Shell",
    };
    return map[ext] || ext.toUpperCase() || "Plain Text";
  }

  const isEditorActive = activeFile && !location.pathname.startsWith("/settings");

  return (
    <div className={`ide ${aiPanelOpen ? "ide--ai-open" : ""}`}>
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
            ) : (
              <>
                <div className="side-panel__header">
                  <span className="side-panel__title">Explorer</span>
                  <div className="side-panel__actions">
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
        <div className="ide__editor-area">
          <TabBar
            files={openFiles}
            activeIdx={activeFileIdx}
            workspacePath={workspacePath}
            onSelect={setActiveFile}
            onClose={closeFile}
            onCloseAll={closeAllFiles}
            onCloseOthers={closeOtherFiles}
          />
          {isEditorActive && activeFile && (
            <Breadcrumbs filePath={activeFile.path} workspacePath={workspacePath} />
          )}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {isEditorActive ? (
              <Editor
                key={activeFile.path}
                content={fileContent}
                filename={activeFile.name}
                filePath={activeFile.path}
                initialCursorLine={activeFile.cursorLine}
                initialCursorCol={activeFile.cursorCol}
                initialScrollTop={activeFile.scrollTop}
                onSave={handleFileSave}
                onChange={(mod) => markModified(activeFile.path, mod)}
                onCursorChange={(line, col, scroll) => updateFileState(activeFile.path, { cursorLine: line, cursorCol: col, scrollTop: scroll })}
              />
            ) : workspacePath ? (
              <div className="empty-state">
                <p className="empty-state__text">Select a file from the explorer to start editing</p>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </div>

        {bottomPanelOpen && (
          <>
            <PanelResizer direction="vertical" onResize={handleBottomResize} />
            <div className="ide__bottom-panel" style={{ height: bottomPanelHeight }}>
              <TerminalPanel />
            </div>
          </>
        )}
      </div>

      {/* AI panel (right side) */}
      {aiPanelOpen && (
        <div className="ide__ai-panel" style={{ width: aiPanelWidth }}>
          <PanelResizer onResize={handleAiResize} />
          <AiPanel />
        </div>
      )}

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
      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}

      {/* Status bar */}
      <div className="ide__status-bar">
        <IdeStatusBar
          branch={gitBranch}
          language={activeFile ? getLanguage(activeFile.name) : undefined}
          line={activeFile?.cursorLine || undefined}
          col={activeFile?.cursorCol || undefined}
          workspaceName={workspaceName}
        />
      </div>
    </div>
  );
}
