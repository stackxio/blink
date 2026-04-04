import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import MonacoDiffViewer from "./MonacoDiffViewer";
import {
  RefreshCw,
  Plus,
  Minus,
  Check,
  WandSparkles,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
  FileX,
  FileQuestion,
  ArrowRightLeft,
  GitBranch,
  ArrowUp,
  ArrowDown,
  History,
} from "lucide-react";
import GitLogViewer from "./GitLogViewer";
import { loadBlinkCodeConfig } from "@@/panel/config";

const FILE_RENDER_BATCH = 200;

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface Props {
  workspacePath: string | null;
  onFileSelect?: (path: string, name: string) => void;
}

function statusIcon(status: string) {
  switch (status) {
    case "modified":
      return <FileText />;
    case "added":
      return <FilePlus />;
    case "deleted":
      return <FileX />;
    case "untracked":
      return <FileQuestion />;
    case "renamed":
      return <ArrowRightLeft />;
    default:
      return <FileText />;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "modified":
      return "M";
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "untracked":
      return "?";
    case "renamed":
      return "R";
    default:
      return "?";
  }
}

export default function GitPanel({ workspacePath, onFileSelect }: Props) {
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [branch, setBranch] = useState<string>("");
  const [branches, setBranches] = useState<string[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [generatingCommitMsg, setGeneratingCommitMsg] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffOriginal, setDiffOriginal] = useState<string>("");
  const [diffModified, setDiffModified] = useState<string>("");
  const [useMoncoDiff] = useState(() => {
    try {
      const s = localStorage.getItem("blink:diffEditor");
      return s === null ? true : s === "true";
    } catch {
      return true;
    }
  });
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [pushPullStatus, setPushPullStatus] = useState<string | null>(null);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [visibleStagedCount, setVisibleStagedCount] = useState(FILE_RENDER_BATCH);
  const [visibleUnstagedCount, setVisibleUnstagedCount] = useState(FILE_RENDER_BATCH);

  const staged = useMemo(() => files.filter((f) => f.staged), [files]);
  const unstaged = useMemo(() => files.filter((f) => !f.staged), [files]);
  const visibleStaged = useMemo(
    () => staged.slice(0, visibleStagedCount),
    [staged, visibleStagedCount],
  );
  const visibleUnstaged = useMemo(
    () => unstaged.slice(0, visibleUnstagedCount),
    [unstaged, visibleUnstagedCount],
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (!workspacePath) return;
      if (!silent) setLoading(true);
      try {
        const [statusResult, branchResult] = await Promise.all([
          invoke<GitFileStatus[]>("git_status", { path: workspacePath }),
          invoke<string>("git_branch", { path: workspacePath }),
        ]);
        setFiles(statusResult);
        setBranch(branchResult);
      } catch {
        // Not a git repo or git not available
        setFiles([]);
        setBranch("");
        setBranches([]);
      }
      if (!silent) setLoading(false);
    },
    [workspacePath],
  );

  useEffect(() => {
    refresh(); // eslint-disable-line react-hooks/set-state-in-effect -- trigger initial data load
  }, [refresh]);

  useEffect(() => {
    setVisibleStagedCount(FILE_RENDER_BATCH);
    setVisibleUnstagedCount(FILE_RENDER_BATCH);
  }, [workspacePath]);

  useEffect(() => {
    setVisibleStagedCount((count) =>
      Math.min(Math.max(FILE_RENDER_BATCH, count), staged.length || FILE_RENDER_BATCH),
    );
  }, [staged.length]);

  useEffect(() => {
    setVisibleUnstagedCount((count) =>
      Math.min(Math.max(FILE_RENDER_BATCH, count), unstaged.length || FILE_RENDER_BATCH),
    );
  }, [unstaged.length]);

  useEffect(() => {
    if (!branchDropdownOpen || !workspacePath) return;
    invoke<string[]>("git_branches", { path: workspacePath })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [branchDropdownOpen, workspacePath]);

  // Poll lightweight status only
  useEffect(() => {
    if (!workspacePath) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      void refresh(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [workspacePath, refresh]);

  async function handleStage(filePath: string) {
    if (!workspacePath) return;
    try {
      await invoke("git_stage", { path: workspacePath, filePath });
      refresh(true);
    } catch {}
  }

  async function handleUnstage(filePath: string) {
    if (!workspacePath) return;
    try {
      await invoke("git_unstage", { path: workspacePath, filePath });
      refresh(true);
    } catch {}
  }

  async function handleStageAll() {
    if (!workspacePath) return;
    for (const f of unstaged) {
      try {
        await invoke("git_stage", { path: workspacePath, filePath: f.path });
      } catch {}
    }
    refresh(true);
  }

  async function handleUnstageAll() {
    if (!workspacePath) return;
    for (const f of staged) {
      try {
        await invoke("git_unstage", { path: workspacePath, filePath: f.path });
      } catch {}
    }
    refresh(true);
  }

  async function handleCommit() {
    if (!workspacePath || !commitMsg.trim() || staged.length === 0) return;
    try {
      await invoke("git_commit", { path: workspacePath, message: commitMsg });
      setCommitMsg("");
      refresh();
    } catch {}
  }

  async function handleGenerateCommitMessage() {
    if (!workspacePath || files.length === 0 || generatingCommitMsg) return;
    setGeneratingCommitMsg(true);
    try {
      const provider = loadBlinkCodeConfig().provider;
      const message = await invoke<string>("git_generate_commit_message", {
        path: workspacePath,
        provider,
        stagedOnly: staged.length > 0,
      });
      setCommitMsg(message);
    } catch (e) {
      setPushPullStatus(`AI commit message failed: ${String(e)}`);
      setTimeout(() => setPushPullStatus(null), 4000);
    } finally {
      setGeneratingCommitMsg(false);
    }
  }

  async function handleShowDiff(filePath: string) {
    if (!workspacePath) return;
    if (diffFile === filePath) {
      setDiffText(null);
      setDiffFile(null);
      setDiffOriginal("");
      setDiffModified("");
      return;
    }
    try {
      if (useMoncoDiff) {
        const [original, modified] = await Promise.all([
          invoke<string>("git_file_at_head", { path: workspacePath, filePath }),
          invoke<string>("read_file_content", {
            path: `${workspacePath}/${filePath}`,
          }),
        ]);
        setDiffOriginal(original);
        setDiffModified(modified);
        setDiffText("monaco");
        setDiffFile(filePath);
      } else {
        const diff = await invoke<string>("git_diff", {
          path: workspacePath,
          filePath,
        });
        setDiffText(diff);
        setDiffFile(filePath);
      }
    } catch {
      setDiffText("Failed to load diff");
      setDiffFile(filePath);
    }
  }

  async function handlePush() {
    if (!workspacePath) return;
    setPushPullStatus("Pushing...");
    try {
      await invoke("git_push", { path: workspacePath });
      setPushPullStatus("Pushed.");
    } catch (e) {
      setPushPullStatus(`Push failed: ${String(e)}`);
    }
    setTimeout(() => setPushPullStatus(null), 3000);
  }

  async function handlePull() {
    if (!workspacePath) return;
    setPushPullStatus("Pulling...");
    try {
      await invoke("git_pull", { path: workspacePath });
      setPushPullStatus("Pulled.");
      refresh();
    } catch (e) {
      setPushPullStatus(`Pull failed: ${String(e)}`);
    }
    setTimeout(() => setPushPullStatus(null), 3000);
  }

  async function handleCheckoutBranch(branchName: string) {
    if (!workspacePath) return;
    try {
      await invoke("git_checkout_branch", {
        path: workspacePath,
        branch: branchName,
      });
      setBranchDropdownOpen(false);
      refresh();
    } catch {}
  }

  function handleFileClick(filePath: string) {
    if (onFileSelect && workspacePath) {
      const fullPath = `${workspacePath}/${filePath}`;
      const name = filePath.split("/").pop() || filePath;
      onFileSelect(fullPath, name);
    }
  }

  if (!workspacePath) {
    return <div className="git-panel__empty">No workspace open</div>;
  }

  if (!branch && !loading) {
    return <div className="git-panel__empty">Not a git repository</div>;
  }

  if (showLog && workspacePath) {
    return (
      <GitLogViewer
        workspacePath={workspacePath}
        onBack={() => setShowLog(false)}
        onFileSelect={onFileSelect}
      />
    );
  }

  return (
    <div className="git-panel">
      {/* Branch selector */}
      <div className="git-panel__branch">
        <button
          type="button"
          className="git-panel__branch-btn"
          onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
        >
          <GitBranch size={14} />
          <span>{branch}</span>
          <ChevronDown size={12} />
        </button>
        <button type="button" className="git-panel__refresh-btn" onClick={handlePull} title="Pull">
          <ArrowDown size={14} />
        </button>
        <button type="button" className="git-panel__refresh-btn" onClick={handlePush} title="Push">
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          className="git-panel__refresh-btn"
          onClick={() => refresh()}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "git-panel__spin" : ""} />
        </button>
        <button
          type="button"
          className="git-panel__refresh-btn"
          onClick={() => setShowLog(true)}
          title="View History"
        >
          <History size={14} />
        </button>
      </div>
      {pushPullStatus && (
        <div
          style={{
            padding: "4px 12px",
            fontSize: "var(--font-size-xs)",
            color: "var(--c-muted-fg)",
            borderBottom: "1px solid var(--c-border)",
          }}
        >
          {pushPullStatus}
        </div>
      )}

      {branchDropdownOpen && (
        <div className="git-panel__branch-dropdown">
          {branches.map((b) => (
            <button
              key={b}
              type="button"
              className={`git-panel__branch-option ${b === branch ? "git-panel__branch-option--active" : ""}`}
              onClick={() => handleCheckoutBranch(b)}
            >
              {b === branch && <Check size={12} />}
              <span>{b}</span>
            </button>
          ))}
        </div>
      )}

      {/* Commit box */}
      <div className="git-panel__commit">
        <div className="git-panel__commit-input-wrap">
          <textarea
            className="git-panel__commit-input"
            placeholder="Commit message..."
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            rows={3}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleCommit();
              }
            }}
          />
          <button
            type="button"
            className="git-panel__commit-ai-btn"
            onClick={handleGenerateCommitMessage}
            disabled={files.length === 0 || generatingCommitMsg}
            title="Generate commit message with AI from the current diff"
          >
            <WandSparkles size={14} className={generatingCommitMsg ? "git-panel__spin" : ""} />
          </button>
        </div>
        <button
          type="button"
          className="git-panel__commit-btn"
          onClick={handleCommit}
          disabled={!commitMsg.trim() || staged.length === 0}
          title="Commit staged changes"
        >
          <Check size={14} />
          <span>Commit</span>
        </button>
      </div>

      {/* Staged changes */}
      <div className="git-panel__section">
        <button
          type="button"
          className="git-panel__section-header"
          onClick={() => setStagedOpen(!stagedOpen)}
        >
          {stagedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Staged Changes</span>
          <span className="git-panel__count">{staged.length}</span>
          {staged.length > 0 && (
            <button
              type="button"
              className="git-panel__section-action"
              onClick={(e) => {
                e.stopPropagation();
                handleUnstageAll();
              }}
              title="Unstage All"
            >
              <Minus size={14} />
            </button>
          )}
        </button>
        {stagedOpen && (
          <div className="git-panel__file-list">
            {visibleStaged.map((f) => (
              <div key={`staged-${f.path}`} className="git-panel__file">
                <button
                  type="button"
                  className="git-panel__file-info"
                  onClick={() => handleShowDiff(f.path)}
                  onDoubleClick={() => handleFileClick(f.path)}
                  title={f.path}
                >
                  <span className={`git-panel__file-icon git-panel__file-icon--${f.status}`}>
                    {statusIcon(f.status)}
                  </span>
                  <span className="git-panel__file-name">{f.path.split("/").pop()}</span>
                  <span className="git-panel__file-dir">
                    {f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : ""}
                  </span>
                  <span className={`git-panel__file-badge git-panel__file-badge--${f.status}`}>
                    {statusLabel(f.status)}
                  </span>
                </button>
                <button
                  type="button"
                  className="git-panel__file-action"
                  onClick={() => handleUnstage(f.path)}
                  title="Unstage"
                >
                  <Minus size={14} />
                </button>
              </div>
            ))}
            {staged.length > visibleStaged.length && (
              <button
                type="button"
                className="git-panel__show-more"
                onClick={() => setVisibleStagedCount((count) => count + FILE_RENDER_BATCH)}
              >
                Show {Math.min(FILE_RENDER_BATCH, staged.length - visibleStaged.length)} more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Unstaged changes */}
      <div className="git-panel__section">
        <button
          type="button"
          className="git-panel__section-header"
          onClick={() => setUnstagedOpen(!unstagedOpen)}
        >
          {unstagedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Changes</span>
          <span className="git-panel__count">{unstaged.length}</span>
          {unstaged.length > 0 && (
            <button
              type="button"
              className="git-panel__section-action"
              onClick={(e) => {
                e.stopPropagation();
                handleStageAll();
              }}
              title="Stage All"
            >
              <Plus size={14} />
            </button>
          )}
        </button>
        {unstagedOpen && (
          <div className="git-panel__file-list">
            {visibleUnstaged.map((f) => (
              <div key={`unstaged-${f.path}`} className="git-panel__file">
                <button
                  type="button"
                  className="git-panel__file-info"
                  onClick={() => handleShowDiff(f.path)}
                  onDoubleClick={() => handleFileClick(f.path)}
                  title={f.path}
                >
                  <span className={`git-panel__file-icon git-panel__file-icon--${f.status}`}>
                    {statusIcon(f.status)}
                  </span>
                  <span className="git-panel__file-name">{f.path.split("/").pop()}</span>
                  <span className="git-panel__file-dir">
                    {f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : ""}
                  </span>
                  <span className={`git-panel__file-badge git-panel__file-badge--${f.status}`}>
                    {statusLabel(f.status)}
                  </span>
                </button>
                <button
                  type="button"
                  className="git-panel__file-action"
                  onClick={() => handleStage(f.path)}
                  title="Stage"
                >
                  <Plus size={14} />
                </button>
              </div>
            ))}
            {unstaged.length > visibleUnstaged.length && (
              <button
                type="button"
                className="git-panel__show-more"
                onClick={() => setVisibleUnstagedCount((count) => count + FILE_RENDER_BATCH)}
              >
                Show {Math.min(FILE_RENDER_BATCH, unstaged.length - visibleUnstaged.length)} more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline diff viewer */}
      {diffText && diffFile && (
        <div className="git-panel__diff">
          <div className="git-panel__diff-header">
            <span>{diffFile}</span>
            <button
              type="button"
              className="git-panel__diff-close"
              onClick={() => {
                setDiffText(null);
                setDiffFile(null);
                setDiffOriginal("");
                setDiffModified("");
              }}
            >
              ×
            </button>
          </div>
          {useMoncoDiff && diffText === "monaco" ? (
            <MonacoDiffViewer
              original={diffOriginal}
              modified={diffModified}
              filename={diffFile.split("/").pop() ?? diffFile}
            />
          ) : (
            <pre className="git-panel__diff-content">
              {diffText.split("\n").map((line, i) => {
                let cls = "";
                if (line.startsWith("+") && !line.startsWith("+++"))
                  cls = "git-panel__diff-line--add";
                else if (line.startsWith("-") && !line.startsWith("---"))
                  cls = "git-panel__diff-line--del";
                else if (line.startsWith("@@")) cls = "git-panel__diff-line--hunk";
                return (
                  <div key={i} className={`git-panel__diff-line ${cls}`}>
                    {line}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
