import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, GitCommit, User, Calendar, Hash } from "lucide-react";

interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface Props {
  workspacePath: string;
  onBack: () => void;
  onFileSelect?: (path: string, name: string) => void;
}

export default function GitLogViewer({ workspacePath, onBack, onFileSelect }: Props) {
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const loadCommits = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      try {
        const result = await invoke<GitCommitInfo[]>("git_log", {
          path: workspacePath,
          limit: PAGE_SIZE * (pageNum + 1),
        });
        setCommits(result);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [workspacePath],
  );

  useEffect(() => {
    loadCommits(page);
  }, [loadCommits, page]);

  async function handleSelectCommit(hash: string) {
    if (selectedHash === hash) {
      setSelectedHash(null);
      setDiff(null);
      return;
    }
    setSelectedHash(hash);
    setDiffLoading(true);
    setDiff(null);
    try {
      const result = await invoke<string>("git_show", { path: workspacePath, hash });
      setDiff(result);
    } catch {
      setDiff("(could not load diff)");
    } finally {
      setDiffLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  const visible = commits.slice(0, PAGE_SIZE * (page + 1));

  return (
    <div className="git-log-viewer">
      <div className="git-log-viewer__header">
        <button type="button" className="git-log-viewer__back" onClick={onBack} title="Back">
          <ArrowLeft size={14} />
          <span>History</span>
        </button>
      </div>

      <div className="git-log-viewer__body">
        <div className="git-log-viewer__list">
          {loading && commits.length === 0 && (
            <div className="git-log-viewer__loading">Loading…</div>
          )}
          {visible.map((commit) => {
            const isSelected = commit.hash === selectedHash;
            return (
              <div key={commit.hash}>
                <button
                  type="button"
                  className={`git-log-viewer__commit${isSelected ? " git-log-viewer__commit--active" : ""}`}
                  onClick={() => handleSelectCommit(commit.hash)}
                >
                  <div className="git-log-viewer__commit-top">
                    <GitCommit size={12} className="git-log-viewer__commit-icon" />
                    <span className="git-log-viewer__commit-msg">{commit.message}</span>
                    <span className="git-log-viewer__commit-hash">{commit.hash.slice(0, 7)}</span>
                  </div>
                  <div className="git-log-viewer__commit-meta">
                    <User size={10} />
                    <span>{commit.author}</span>
                    <Calendar size={10} />
                    <span>{formatDate(commit.date)}</span>
                  </div>
                </button>

                {isSelected && (
                  <div className="git-log-viewer__diff">
                    {diffLoading ? (
                      <div className="git-log-viewer__diff-loading">Loading diff…</div>
                    ) : diff ? (
                      <DiffView diff={diff} onFileSelect={onFileSelect} />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}

          {commits.length > 0 && commits.length === PAGE_SIZE * (page + 1) && (
            <button
              type="button"
              className="git-log-viewer__load-more"
              onClick={() => setPage((p) => p + 1)}
              disabled={loading}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffView({
  diff,
  onFileSelect,
}: {
  diff: string;
  onFileSelect?: (path: string, name: string) => void;
}) {
  const lines = diff.split("\n");
  let currentFile: string | null = null;

  return (
    <pre className="git-log-viewer__diff-content">
      {lines.map((line, i) => {
        let cls = "";
        if (line.startsWith("diff --git")) {
          const match = line.match(/b\/(.+)$/);
          currentFile = match ? match[1] : null;
          return (
            <div key={i} className="git-log-viewer__diff-file">
              <Hash size={10} />
              {currentFile && onFileSelect ? (
                <button
                  type="button"
                  className="git-log-viewer__diff-file-link"
                  onClick={() => {
                    if (currentFile)
                      onFileSelect(currentFile, currentFile.split("/").pop() || currentFile);
                  }}
                >
                  {currentFile}
                </button>
              ) : (
                <span>{currentFile ?? line}</span>
              )}
            </div>
          );
        }
        if (line.startsWith("+") && !line.startsWith("+++")) cls = "git-log-viewer__diff-add";
        else if (line.startsWith("-") && !line.startsWith("---")) cls = "git-log-viewer__diff-del";
        else if (line.startsWith("@@")) cls = "git-log-viewer__diff-hunk";
        else if (line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
          cls = "git-log-viewer__diff-meta";
        }
        return (
          <div key={i} className={`git-log-viewer__diff-line${cls ? ` ${cls}` : ""}`}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}
