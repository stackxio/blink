import { Settings, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { useAppStore } from "@/store";
import WorkspaceTabs from "./WorkspaceTabs";

export default function Titlebar() {
  const navigate = useNavigate();
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);

  return (
    <div className="titlebar">
      <div className="titlebar__left">
        <WorkspaceTabs />
      </div>
      <div className="titlebar__drag" data-tauri-drag-region />
      <div className="titlebar__right">
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
          onClick={() => navigate("/settings")}
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}
