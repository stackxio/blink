import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, ChevronLeft } from "lucide-react";

interface Hunk {
  header: string;
  lines: string[];
  patch: string;
}

interface Props {
  workspacePath: string;
  filePath: string;
  onClose: () => void;
  onStaged: () => void;
}

function parseDiffIntoHunks(diff: string, filePath: string): Hunk[] {
  if (!diff.trim()) return [];

  // Extract the file header lines (--- and +++)
  const lines = diff.split("\n");
  let fileHeaderA = `--- a/${filePath}`;
  let fileHeaderB = `+++ b/${filePath}`;

  for (const line of lines) {
    if (line.startsWith("--- ")) fileHeaderA = line;
    if (line.startsWith("+++ ")) fileHeaderB = line;
  }

  const fileHeader = `${fileHeaderA}\n${fileHeaderB}\n`;

  // Split diff on hunk boundaries
  const hunkParts = diff.split(/(?=^@@[ \t])/m);
  const hunks: Hunk[] = [];

  for (const part of hunkParts) {
    if (!part.startsWith("@@")) continue;
    const partLines = part.split("\n");
    const header = partLines[0];
    const bodyLines = partLines.slice(1).filter((l, i, arr) => {
      // drop trailing empty lines (all empty lines at the very end)
      if (i === arr.length - 1 && l === "") return false;
      return true;
    });

    const patch = `${fileHeader}${header}\n${bodyLines.join("\n")}\n`;
    hunks.push({ header, lines: bodyLines, patch });
  }

  return hunks;
}

export default function HunkViewer({ workspacePath, filePath, onClose, onStaged }: Props) {
  const [hunks, setHunks] = useState<Hunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [stagingIdx, setStagingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<string>("git_diff_file", { path: workspacePath, filePath })
      .then((diff) => {
        setHunks(parseDiffIntoHunks(diff, filePath));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [workspacePath, filePath]);

  async function handleStageHunk(idx: number) {
    const hunk = hunks[idx];
    if (!hunk) return;
    setStagingIdx(idx);
    try {
      await invoke("git_stage_hunk", {
        path: workspacePath,
        filePath,
        patch: hunk.patch,
      });
      // Remove staged hunk from list; if all staged, close
      const remaining = hunks.filter((_, i) => i !== idx);
      if (remaining.length === 0) {
        onStaged();
      } else {
        setHunks(remaining);
      }
    } catch (e) {
      setError(`Failed to stage hunk: ${String(e)}`);
    } finally {
      setStagingIdx(null);
    }
  }

  function lineClass(line: string): string {
    if (line.startsWith("+")) return "git-panel__diff-line git-panel__diff-line--add";
    if (line.startsWith("-")) return "git-panel__diff-line git-panel__diff-line--del";
    return "git-panel__diff-line";
  }

  return (
    <div className="hunk-viewer">
      <div className="hunk-viewer__header">
        <button type="button" className="hunk-viewer__back" onClick={onClose} title="Back">
          <ChevronLeft size={14} />
          <span>Back</span>
        </button>
        <span className="hunk-viewer__title">{filePath.split("/").pop()}</span>
        <button type="button" className="hunk-viewer__close" onClick={onClose} title="Close">
          <X size={14} />
        </button>
      </div>

      <div className="hunk-viewer__body">
        {loading && <div className="hunk-viewer__message">Loading diff...</div>}
        {!loading && error && (
          <div className="hunk-viewer__message hunk-viewer__message--error">{error}</div>
        )}
        {!loading && !error && hunks.length === 0 && (
          <div className="hunk-viewer__message">No unstaged hunks found.</div>
        )}
        {!loading &&
          !error &&
          hunks.map((hunk, idx) => (
            <div key={idx} className="hunk-viewer__hunk">
              <div className="hunk-viewer__hunk-header">
                <span className="git-panel__diff-line git-panel__diff-line--hunk">
                  {hunk.header}
                </span>
                <button
                  type="button"
                  className="hunk-viewer__stage-btn"
                  onClick={() => handleStageHunk(idx)}
                  disabled={stagingIdx !== null}
                  title="Stage this hunk"
                >
                  {stagingIdx === idx ? "Staging..." : "Stage Hunk"}
                </button>
              </div>
              <pre className="git-panel__diff-content">
                {hunk.lines.map((line, lineIdx) => (
                  <div key={lineIdx} className={lineClass(line)}>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
          ))}
      </div>
    </div>
  );
}
