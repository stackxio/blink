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
    <div>
      <h1 className="mb-4 text-lg font-semibold text-foreground">Archived</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        Chats you archive are listed here. Restore to move them back to the sidebar, or delete
        permanently.
      </p>

      <div className="rounded-lg border border-border bg-surface">
        {threads.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No archived chats.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li
                key={thread.id}
                className="group flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-surface-raised/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{thread.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Archived {thread.archived_at ? new Date(thread.archived_at).toLocaleDateString() : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleRestore(thread.id)}
                    title="Restore to sidebar"
                    className="rounded p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePermanent(thread.id)}
                    title="Delete permanently"
                    className="rounded p-1.5 text-muted-foreground hover:bg-surface-raised hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
