import { useState, useCallback } from "react";
import { GitBranch, Terminal } from "lucide-react";
import { useAppStore } from "@/store";

interface Props {
  branch?: string | null;
  language?: string;
  line?: number;
  col?: number;
  workspaceName?: string;
}

export default function IdeStatusBar({ branch, language, line, col, workspaceName }: Props) {
  const ws = useAppStore((s) => s.activeWorkspace());
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const bottomPanelOpen = ws?.bottomPanelOpen ?? false;

  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem("caret:wordWrap") === "true");
  const [tabSize] = useState(() => parseInt(localStorage.getItem("caret:tabSize") || "2", 10));

  const toggleWordWrap = useCallback(() => {
    const next = !wordWrap;
    setWordWrap(next);
    localStorage.setItem("caret:wordWrap", String(next));
    // Dispatch a storage event so the editor can react to the change
    window.dispatchEvent(new StorageEvent("storage", { key: "caret:wordWrap", newValue: String(next) }));
  }, [wordWrap]);

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
        <button type="button" className="status-bar__item" title="Indentation">
          Spaces: {tabSize}
        </button>
        <button type="button" className="status-bar__item" title="File encoding">
          UTF-8
        </button>
        <button type="button" className="status-bar__item" title="End of line sequence">
          LF
        </button>
        {language && (
          <button type="button" className="status-bar__item">
            {language}
          </button>
        )}
        <button
          type="button"
          className={`status-bar__item ${wordWrap ? "status-bar__item--active" : ""}`}
          onClick={toggleWordWrap}
          title="Toggle Word Wrap"
        >
          Word Wrap
        </button>
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
