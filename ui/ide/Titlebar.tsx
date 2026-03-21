import { Settings } from "lucide-react";
import { useNavigate } from "react-router";
import WorkspaceTabs from "./WorkspaceTabs";

export default function Titlebar() {
  const navigate = useNavigate();

  return (
    <div className="titlebar">
      <div className="titlebar__left">
        <WorkspaceTabs />
      </div>
      <div className="titlebar__drag" data-tauri-drag-region />
      <div className="titlebar__right">
        <button type="button" className="titlebar__action" title="Settings" onClick={() => navigate("/settings")}>
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}
