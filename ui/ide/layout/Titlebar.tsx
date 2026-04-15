import { useEffect, useState } from "react";
import {
  Settings,
  Sparkles,
  ArrowUpCircle,
  CloudDownload,
  RotateCcw,
  Columns2,
  Bot,
  Code2,
  PanelLeft,
  PanelRight,
  Code,
  Play,
} from "lucide-react";
// PanelLeft and PanelRight are used for the layout mode toggle button below
import { useAppStore } from "@/store";
import type { FocusMode, AppMode } from "@/store";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import WorkspaceTabs from "./WorkspaceTabs";

function focusModeIcon(mode: FocusMode) {
  if (mode === "ai-only") return <Bot size={14} />;
  if (mode === "editor-only") return <Code2 size={14} />;
  return <Columns2 size={14} />;
}

function focusModeTitle(mode: FocusMode) {
  if (mode === "ai-only") return "Focus: AI only — click to show Editor only";
  if (mode === "editor-only") return "Focus: Editor only — click to show both";
  return "Focus: Both panels — click to show AI only";
}

export default function Titlebar() {
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);
  const openSettings = useAppStore((s) => s.openSettings);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const cycleFocusMode = useAppStore((s) => s.cycleFocusMode);
  const setLayoutMode = useAppStore((s) => s.setLayoutMode);
  const appMode = useAppStore((s) => s.appMode);
  const setAppMode = useAppStore((s) => s.setAppMode);
  const ws = useAppStore((s) => s.activeWorkspace());
  const focusMode = ws?.focusMode ?? "both";
  const layoutMode = ws?.layoutMode ?? "ai-center";
  const {
    hasUpdate,
    isDownloading,
    isReady,
    isUpToDate,
    latestVersion,
    progress,
    install,
    restartNow,
    dismiss,
    checkNow,
  } = useUpdateCheck();

  const [upToDatePopup, setUpToDatePopup] = useState(false);

  // Wire native menu "Check for Updates..." → checkNow
  useEffect(() => {
    const handler = () => checkNow();
    document.addEventListener("codrift:check-updates", handler);
    return () => document.removeEventListener("codrift:check-updates", handler);
  }, [checkNow]);

  // Show popup when check confirms already on latest
  useEffect(() => {
    if (isUpToDate) setUpToDatePopup(true);
  }, [isUpToDate]);

  return (
    <div className="titlebar">
      <div className="titlebar__left">
        <WorkspaceTabs />
      </div>
      <div className="titlebar__drag" data-tauri-drag-region />
      <div className="titlebar__right">
        {isReady && (
          <div className="titlebar__update titlebar__update--ready">
            <RotateCcw size={12} />
            <button type="button" className="titlebar__update-action" onClick={restartNow}>
              Restart to update
            </button>
          </div>
        )}
        {isDownloading && (
          <div className="titlebar__update">
            <CloudDownload size={12} />
            <span>{progress !== null ? `${progress}%` : "Downloading…"}</span>
          </div>
        )}
        {hasUpdate && (
          <div className="titlebar__update">
            <ArrowUpCircle size={12} />
            <button
              type="button"
              className="titlebar__update-action"
              onClick={install}
              disabled={isDownloading}
              title={`Install Codrift ${latestVersion}`}
            >
              Update to {latestVersion}
            </button>
            <button
              type="button"
              className="titlebar__update-dismiss"
              onClick={dismiss}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {aiPanelOpen && focusMode === "both" && (
          <button
            type="button"
            className="titlebar__action"
            title={
              layoutMode === "ai-center"
                ? "AI-center layout — click for Editor-center"
                : "Editor-center layout — click for AI-center"
            }
            onClick={() =>
              setLayoutMode(layoutMode === "ai-center" ? "editor-center" : "ai-center")
            }
          >
            {layoutMode === "ai-center" ? <PanelLeft size={14} /> : <PanelRight size={14} />}
          </button>
        )}
        <button
          type="button"
          className="titlebar__action"
          title={focusModeTitle(focusMode)}
          onClick={cycleFocusMode}
          style={focusMode !== "both" ? { color: "var(--c-accent)" } : undefined}
        >
          {focusModeIcon(focusMode)}
        </button>
        <button
          type="button"
          className="titlebar__action"
          title="AI Assistant (⌘L)"
          onClick={toggleAiPanel}
          style={aiPanelOpen ? { color: "var(--c-accent)" } : undefined}
        >
          <Sparkles size={14} />
        </button>
        {/* Editor ↔ Builder mode toggle */}
        <div className="titlebar__mode-toggle">
          <button
            type="button"
            className={`titlebar__mode-btn${appMode === "editor" ? " titlebar__mode-btn--active" : ""}`}
            title="Editor mode"
            onClick={() => setAppMode("editor")}
          >
            <Code size={13} />
            <span>Editor</span>
          </button>
          <button
            type="button"
            className={`titlebar__mode-btn${appMode === "builder" ? " titlebar__mode-btn--active" : ""}`}
            title="Builder mode"
            onClick={() => setAppMode("builder")}
          >
            <Play size={13} />
            <span>Builder</span>
          </button>
        </div>
        <button
          type="button"
          className="titlebar__action"
          title="Settings"
          onClick={() => openSettings()}
        >
          <Settings size={14} />
        </button>
      </div>

      {upToDatePopup && (
        <div className="titlebar__up-to-date-backdrop" onClick={() => setUpToDatePopup(false)}>
          <div className="titlebar__up-to-date-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="titlebar__up-to-date-title">You&apos;re up to date</div>
            <div className="titlebar__up-to-date-body">
              Codrift is already on the latest version.
            </div>
            <button
              type="button"
              className="btn btn--default btn--sm"
              onClick={() => setUpToDatePopup(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
