import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";

interface HistoryEntry {
  timestamp_ms: number;
  label: string;
  snapshot_file: string;
}

interface Props {
  filePath: string | null;
  onRestore: (content: string, filePath: string) => void;
}

export default function LocalHistoryPanel({ filePath, onRestore }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!filePath) {
      setEntries([]);
      setSelectedEntry(null);
      setPreviewContent(null);
      return;
    }
    setLoading(true);
    try {
      const result = await invoke<HistoryEntry[]>("list_local_history", {
        filePath,
      });
      setEntries(result);
      // Clear selection if it no longer exists
      setSelectedEntry((prev) =>
        prev && result.find((e) => e.snapshot_file === prev.snapshot_file) ? prev : null,
      );
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleSelect(entry: HistoryEntry) {
    if (selectedEntry?.snapshot_file === entry.snapshot_file) {
      setSelectedEntry(null);
      setPreviewContent(null);
      return;
    }
    setSelectedEntry(entry);
    try {
      const content = await invoke<string>("read_local_history_entry", {
        snapshotFile: entry.snapshot_file,
      });
      setPreviewContent(content);
    } catch {
      setPreviewContent("Failed to load snapshot.");
    }
  }

  async function handleRestore(entry: HistoryEntry) {
    if (!filePath || restoring) return;
    setRestoring(true);
    try {
      const content = await invoke<string>("read_local_history_entry", {
        snapshotFile: entry.snapshot_file,
      });
      await invoke("write_file_content", { path: filePath, content });
      onRestore(content, filePath);
    } catch {
      // silently ignore
    } finally {
      setRestoring(false);
    }
  }

  async function handleClearHistory() {
    if (!filePath) return;
    try {
      await invoke("clear_local_history_for_file", { filePath });
      setEntries([]);
      setSelectedEntry(null);
      setPreviewContent(null);
    } catch {
      // silently ignore
    }
  }

  if (!filePath) {
    return <div className="local-history__empty">No file open</div>;
  }

  if (loading) {
    return <div className="local-history__empty">Loading…</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="local-history__empty">
        No history yet. History snapshots are saved automatically when you save a file.
      </div>
    );
  }

  return (
    <div className="local-history">
      <div className="local-history__actions">
        <button
          type="button"
          className="local-history__clear-btn"
          onClick={handleClearHistory}
          title="Clear all history for this file"
        >
          <Trash2 size={12} />
          <span>Clear</span>
        </button>
      </div>

      <div className="local-history__list">
        {entries.map((entry) => {
          const isSelected = selectedEntry?.snapshot_file === entry.snapshot_file;
          return (
            <div key={entry.snapshot_file}>
              <div
                className={`local-history__entry${isSelected ? " local-history__entry--active" : ""}`}
                onClick={() => void handleSelect(entry)}
              >
                <span className="local-history__label">{entry.label}</span>
                <button
                  type="button"
                  className="local-history__restore-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRestore(entry);
                  }}
                  disabled={restoring}
                  title="Restore this version"
                >
                  Restore
                </button>
              </div>
              {isSelected && previewContent !== null && (
                <pre className="local-history__preview">{previewContent}</pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
