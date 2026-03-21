import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RotateCcw, Trash2 } from "lucide-react";

interface ArchivedThread {
  id: string;
  title: string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  message_count?: number;
}

export default function SettingsArchived() {
  const [threads, setThreads] = useState<ArchivedThread[]>([]);

  useEffect(() => {
    invoke<ArchivedThread[]>("list_archived_threads")
      .then(setThreads)
      .catch(() => setThreads([]));
  }, []);

  async function handleRestore(id: string) {
    try {
      await invoke("unarchive_thread", { id });
      setThreads((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // Non-critical
    }
  }

  async function handleDeletePermanent(id: string) {
    try {
      await invoke("delete_thread", { id });
      setThreads((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // Non-critical
    }
  }

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">Archived</h1>
      <p className="settings-section__description">
        Chats you archive are listed here. Restore to move them back to the sidebar, or delete
        permanently.
      </p>

      <div className="settings-card">
        {threads.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 16px" }}>
            <span className="empty-state__text">No archived chats.</span>
          </div>
        ) : (
          <div>
            {threads.map((thread) => (
              <div key={thread.id} className="settings-row">
                <div className="settings-row__info">
                  <div className="settings-row__label">{thread.title}</div>
                  <div className="settings-row__hint">
                    Archived {thread.archived_at ? new Date(thread.archived_at).toLocaleDateString() : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => handleRestore(thread.id)}
                    title="Restore to sidebar"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => handleDeletePermanent(thread.id)}
                    title="Delete permanently"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
