import { GitBranch, Terminal } from "lucide-react";
import { useAppStore } from "@/stores/app";

interface Props {
  branch?: string | null;
  language?: string;
  line?: number;
  col?: number;
  workspaceName?: string;
}

export default function IdeStatusBar({ branch, language, line, col, workspaceName }: Props) {
  const { bottomPanelOpen, toggleBottomPanel } = useAppStore();

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        {branch && (
          <button type="button" className="status-bar__item">
            <GitBranch />
            <span>{branch}</span>
          </button>
        )}
      </div>
      <div className="status-bar__right">
        {line != null && col != null && (
          <button type="button" className="status-bar__item">
            Ln {line}, Col {col}
          </button>
        )}
        {language && (
          <button type="button" className="status-bar__item">
            {language}
          </button>
        )}
        <button
          type="button"
          className="status-bar__item"
          onClick={toggleBottomPanel}
          title="Toggle Terminal (⌃`)"
          style={bottomPanelOpen ? { opacity: 1 } : undefined}
        >
          <Terminal />
        </button>
        {workspaceName && (
          <button type="button" className="status-bar__item">
            {workspaceName}
          </button>
        )}
      </div>
    </div>
  );
}
