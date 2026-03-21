import { useCallback, useState, useEffect, lazy, Suspense } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/app";
import { loadBindings, matchesKey, effectiveKey } from "@/lib/key-bindings";
import Titlebar from "./Titlebar";
import ActivityBar from "./ActivityBar";
import FileTree from "./FileTree";
import TabBar from "./TabBar";
import PanelResizer from "./PanelResizer";
import IdeStatusBar from "./IdeStatusBar";
import Editor from "./Editor";
import TerminalPanel from "./TerminalPanel";
import FileSearch from "./FileSearch";

export default function IdeLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const toggleSidePanel = useAppStore((s) => s.toggleSidePanel);
  const addWorkspace = useAppStore((s) => s.addWorkspace);
  const openFile = useAppStore((s) => s.openFile);
  const closeFile = useAppStore((s) => s.closeFile);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const markModified = useAppStore((s) => s.markModified);
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

  const [fileSearchOpen, setFileSearchOpen] = useState(false);

  // Load saved workspaces on mount
  useEffect(() => {
    loadSavedWorkspaces();
  }, []);

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
      // Cmd+P — file search
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        if (workspacePath) setFileSearchOpen((v) => !v);
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
      .catch(() => { if (!cancelled) setFileContent("// Failed to load file"); });
    return () => { cancelled = true; };
  }, [activeFile?.path]);

  const handleSideResize = useCallback(
    (delta: number) => setSidePanelWidth(Math.max(180, Math.min(480, sidePanelWidth + delta))),
    [sidePanelWidth, setSidePanelWidth],
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
            <div className="side-panel__header">
              <span className="side-panel__title">Explorer</span>
            </div>
            <div className="side-panel__body">
              <FileTree
                rootPath={workspacePath}
                onOpenFolder={handleOpenFolder}
                onFileSelect={handleFileSelect}
                activeFilePath={activeFile?.path ?? null}
              />
            </div>
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
            onSelect={setActiveFile}
            onClose={closeFile}
          />
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {isEditorActive ? (
              <Editor
                key={activeFile.path}
                content={fileContent}
                filename={activeFile.name}
                filePath={activeFile.path}
                onSave={handleFileSave}
                onChange={(mod) => markModified(activeFile.path, mod)}
              />
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

      {/* Status bar */}
      <div className="ide__status-bar">
        <IdeStatusBar
          branch="main"
          language={activeFile ? getLanguage(activeFile.name) : undefined}
          workspaceName={workspaceName}
        />
      </div>
    </div>
  );
}
