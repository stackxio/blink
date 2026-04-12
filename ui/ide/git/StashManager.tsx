import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Layers, Calendar, Trash2, Download, Plus } from "lucide-react";

interface StashEntry {
  index: number;
  message: string;
  date: string;
}

interface Props {
  workspacePath: string | null;
  onClose: () => void;
}

export default function StashManager({ workspacePath, onClose }: Props) {
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [pushing, setPushing] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const loadStashes = useCallback(async () => {
    if (!workspacePath) return;
    setLoading(true);
    try {
      const result = await invoke<StashEntry[]>("git_stash_list", {
        path: workspacePath,
      });
      setStashes(result);
    } catch {
      setStashes([]);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    loadStashes();
  }, [loadStashes]);

  function showStatus(msg: string) {
    setActionStatus(msg);
    setTimeout(() => setActionStatus(null), 3000);
  }

  async function handlePush() {
    if (!workspacePath || pushing) return;
    setPushing(true);
    try {
      await invoke("git_stash_push", {
        path: workspacePath,
        message: newMessage.trim() || null,
      });
      setNewMessage("");
      await loadStashes();
      showStatus("Stash saved.");
    } catch (e) {
      showStatus(`Stash failed: ${String(e)}`);
    } finally {
      setPushing(false);
    }
  }

  async function handlePop(index: number) {
    if (!workspacePath) return;
    try {
      await invoke("git_stash_pop", { path: workspacePath, index });
      await loadStashes();
      showStatus("Stash applied and dropped.");
    } catch (e) {
      showStatus(`Pop failed: ${String(e)}`);
    }
  }

  async function handleDrop(index: number) {
    if (!workspacePath) return;
    try {
      await invoke("git_stash_drop", { path: workspacePath, index });
      await loadStashes();
      showStatus("Stash dropped.");
    } catch (e) {
      showStatus(`Drop failed: ${String(e)}`);
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

  return (
    <div className="stash-manager">
      <div className="stash-manager__header">
        <button type="button" className="stash-manager__back" onClick={onClose} title="Back">
          <ArrowLeft size={14} />
          <span>Stashes</span>
        </button>
      </div>

      <div className="stash-manager__push">
        <div className="stash-manager__push-row">
          <input
            type="text"
            className="stash-manager__push-input"
            placeholder="Stash message (optional)..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePush();
            }}
          />
          <button
            type="button"
            className="stash-manager__push-btn"
            onClick={handlePush}
            disabled={pushing}
            title="Stash current changes"
          >
            <Plus size={14} />
            <span>{pushing ? "Saving…" : "Stash"}</span>
          </button>
        </div>
      </div>

      {actionStatus && (
        <div className="stash-manager__status">{actionStatus}</div>
      )}

      <div className="stash-manager__body">
        {loading && stashes.length === 0 && (
          <div className="stash-manager__loading">Loading…</div>
        )}

        {!loading && stashes.length === 0 && (
          <div className="stash-manager__empty">
            <Layers size={24} />
            <span>No stashes</span>
          </div>
        )}

        <div className="stash-manager__list">
          {stashes.map((stash) => (
            <div key={stash.index} className="stash-manager__item">
              <div className="stash-manager__item-top">
                <Layers size={12} className="stash-manager__item-icon" />
                <span className="stash-manager__item-msg">{stash.message}</span>
                <span className="stash-manager__item-index">stash@{`{${stash.index}}`}</span>
              </div>
              <div className="stash-manager__item-meta">
                <Calendar size={10} />
                <span>{formatDate(stash.date)}</span>
              </div>
              <div className="stash-manager__item-actions">
                <button
                  type="button"
                  className="stash-manager__action-btn"
                  onClick={() => handlePop(stash.index)}
                  title="Apply and drop stash"
                >
                  <Download size={13} />
                  <span>Pop</span>
                </button>
                <button
                  type="button"
                  className="stash-manager__action-btn stash-manager__action-btn--danger"
                  onClick={() => handleDrop(stash.index)}
                  title="Drop stash"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
