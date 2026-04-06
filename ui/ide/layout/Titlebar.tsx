import { Settings, Sparkles, ArrowUpCircle, CloudDownload, RotateCcw } from "lucide-react";
import { useAppStore } from "@/store";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import WorkspaceTabs from "./WorkspaceTabs";

export default function Titlebar() {
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);
  const openSettings = useAppStore((s) => s.openSettings);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const {
    hasUpdate,
    isDownloading,
    isReady,
    latestVersion,
    progress,
    install,
    restartNow,
    dismiss,
  } = useUpdateCheck();

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
        <button
          type="button"
          className="titlebar__action"
          title="AI Assistant (⌘L)"
          onClick={toggleAiPanel}
          style={aiPanelOpen ? { color: "var(--c-accent)" } : undefined}
        >
          <Sparkles size={14} />
        </button>
        <button
          type="button"
          className="titlebar__action"
          title="Settings"
          onClick={() => openSettings()}
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}
