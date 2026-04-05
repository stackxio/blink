import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitBranch,
  Terminal,
  AlertCircle,
  AlertTriangle,
  Plus,
  Check,
  ArrowUpCircle,
  RotateCcw,
  CloudDownload,
} from "lucide-react";
import { useAppStore } from "@/store";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";

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
  const setBottomPanelTab = useAppStore((s) => s.setBottomPanelTab);
  const diagnosticSummary = useAppStore((s) => s.diagnosticSummary);
  const bottomPanelOpen = ws?.bottomPanelOpen ?? false;
  const errorCount = diagnosticSummary.errors;
  const warningCount = diagnosticSummary.warnings;

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
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem("blink:wordWrap") === "true");
  const [tabSize] = useState(() => parseInt(localStorage.getItem("blink:tabSize") || "2", 10));

  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [newBranchInput, setNewBranchInput] = useState("");
  const branchPickerRef = useRef<HTMLDivElement>(null);

  const toggleWordWrap = useCallback(() => {
    const next = !wordWrap;
    setWordWrap(next);
    localStorage.setItem("blink:wordWrap", String(next));
    // Dispatch a storage event so the editor can react to the change
    window.dispatchEvent(
      new StorageEvent("storage", { key: "blink:wordWrap", newValue: String(next) }),
    );
  }, [wordWrap]);

  // Load branches when picker opens
  useEffect(() => {
    if (!branchPickerOpen || !ws?.path) return;
    invoke<string[]>("git_branches", { path: ws.path })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [branchPickerOpen, ws?.path]);

  // Close branch picker on outside click
  useEffect(() => {
    if (!branchPickerOpen) return;
    function onClick(e: MouseEvent) {
      if (branchPickerRef.current && !branchPickerRef.current.contains(e.target as Node)) {
        setBranchPickerOpen(false);
        setNewBranchInput("");
      }
    }
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => document.removeEventListener("mousedown", onClick);
  }, [branchPickerOpen]);

  async function handleCheckout(b: string) {
    if (!ws?.path) return;
    try {
      await invoke("git_checkout_branch", { path: ws.path, branch: b });
      setBranchPickerOpen(false);
      setNewBranchInput("");
      // Trigger git branch refresh in IdeLayout via DOM event
      document.dispatchEvent(new CustomEvent("blink:git-refresh"));
    } catch (e) {
      alert(`Failed to switch branch: ${e}`);
    }
  }

  async function handleCreateBranch() {
    if (!ws?.path || !newBranchInput.trim()) return;
    try {
      await invoke("git_create_branch", { path: ws.path, branch: newBranchInput.trim() });
      await invoke("git_checkout_branch", { path: ws.path, branch: newBranchInput.trim() });
      setBranchPickerOpen(false);
      setNewBranchInput("");
      document.dispatchEvent(new CustomEvent("blink:git-refresh"));
    } catch (e) {
      alert(`Failed to create branch: ${e}`);
    }
  }

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        {branch && (
          <div className="status-bar__branch-picker" ref={branchPickerRef}>
            <button
              type="button"
              className="status-bar__item"
              onClick={() => setBranchPickerOpen((v) => !v)}
              title="Switch branch"
            >
              <GitBranch />
              <span>{branch}</span>
            </button>
            {branchPickerOpen && (
              <div className="status-bar__branch-dropdown">
                <div className="status-bar__branch-list">
                  {branches.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className="status-bar__branch-item"
                      onClick={() => handleCheckout(b)}
                    >
                      {b === branch && <Check size={12} />}
                      {b !== branch && <span style={{ width: 12 }} />}
                      <span>{b}</span>
                    </button>
                  ))}
                </div>
                <div className="status-bar__branch-new">
                  <input
                    type="text"
                    className="input input--sm"
                    placeholder="New branch name…"
                    value={newBranchInput}
                    onChange={(e) => setNewBranchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateBranch();
                      if (e.key === "Escape") {
                        setBranchPickerOpen(false);
                        setNewBranchInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--default btn--icon btn--sm"
                    onClick={handleCreateBranch}
                    disabled={!newBranchInput.trim()}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="status-bar__item"
          style={errorCount > 0 ? { color: "var(--c-danger)" } : undefined}
          onClick={() => {
            setBottomPanelTab("problems");
            if (!bottomPanelOpen) toggleBottomPanel();
          }}
          title="Errors"
        >
          <AlertCircle size={12} />
          <span>{errorCount}</span>
        </button>
        <button
          type="button"
          className="status-bar__item"
          style={warningCount > 0 ? { color: "var(--c-warning)" } : undefined}
          onClick={() => {
            setBottomPanelTab("problems");
            if (!bottomPanelOpen) toggleBottomPanel();
          }}
          title="Warnings"
        >
          <AlertTriangle size={12} />
          <span>{warningCount}</span>
        </button>
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
        {isReady && (
          <div className="status-bar__update status-bar__update--ready">
            <RotateCcw size={12} />
            <span>Update ready —</span>
            <button type="button" className="status-bar__update-action" onClick={restartNow}>
              Restart now
            </button>
          </div>
        )}
        {isDownloading && (
          <div className="status-bar__update">
            <CloudDownload size={12} />
            <span>Downloading{progress !== null ? ` ${progress}%` : "…"}</span>
          </div>
        )}
        {hasUpdate && (
          <div className="status-bar__update">
            <ArrowUpCircle size={12} />
            <button
              type="button"
              className="status-bar__update-action"
              onClick={install}
              title={`Install Blink ${latestVersion}`}
            >
              Update to {latestVersion}
            </button>
            <button
              type="button"
              className="status-bar__update-dismiss"
              onClick={dismiss}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
