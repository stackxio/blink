import { useState, useEffect } from "react";
import { Plus, MessageSquare, Trash2, Clock } from "lucide-react";

// ── Chat model ────────────────────────────────────────────────────────────────
// A "chat" is a named session container scoped to a workspace.
// In v1 it's a label + timestamp; in future iterations agent sessions will be
// scoped by chatId so each chat has its own agent history.

export interface BuilderChat {
  id: string;
  name: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
}

function chatsKey(workspacePath: string) {
  return `codrift:builder-chats:${workspacePath}`;
}

function activeChatKey(workspacePath: string) {
  return `codrift:builder-active-chat:${workspacePath}`;
}

export function loadChats(workspacePath: string): BuilderChat[] {
  try {
    const raw = localStorage.getItem(chatsKey(workspacePath));
    return raw ? (JSON.parse(raw) as BuilderChat[]) : [];
  } catch {
    return [];
  }
}

function saveChats(workspacePath: string, chats: BuilderChat[]) {
  localStorage.setItem(chatsKey(workspacePath), JSON.stringify(chats));
}

function loadActiveChat(workspacePath: string): string | null {
  return localStorage.getItem(activeChatKey(workspacePath));
}

function saveActiveChat(workspacePath: string, chatId: string | null) {
  if (chatId) {
    localStorage.setItem(activeChatKey(workspacePath), chatId);
  } else {
    localStorage.removeItem(activeChatKey(workspacePath));
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  workspacePath: string | null;
  activeChatId: string | null;
  onSelectChat: (chat: BuilderChat) => void;
  onNewChat: (chat: BuilderChat) => void;
}

export default function ChatSidebar({ workspacePath, activeChatId, onSelectChat, onNewChat }: Props) {
  const [chats, setChats] = useState<BuilderChat[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!workspacePath) { setChats([]); return; }
    const loaded = loadChats(workspacePath);
    setChats(loaded);
  }, [workspacePath]);

  function createChat() {
    if (!workspacePath) return;
    const now = Date.now();
    const chat: BuilderChat = {
      id: crypto.randomUUID(),
      name: `Chat ${new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      workspacePath,
      createdAt: now,
      updatedAt: now,
    };
    const next = [chat, ...chats];
    setChats(next);
    saveChats(workspacePath, next);
    saveActiveChat(workspacePath, chat.id);
    onNewChat(chat);
  }

  function deleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!workspacePath) return;
    const next = chats.filter((c) => c.id !== id);
    setChats(next);
    saveChats(workspacePath, next);
    if (activeChatId === id) {
      const fallback = next[0] ?? null;
      saveActiveChat(workspacePath, fallback?.id ?? null);
      if (fallback) onSelectChat(fallback);
    }
  }

  function startRename(chat: BuilderChat, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(chat.id);
    setRenameValue(chat.name);
  }

  function commitRename(id: string) {
    if (!workspacePath || !renameValue.trim()) { setRenamingId(null); return; }
    const next = chats.map((c) =>
      c.id === id ? { ...c, name: renameValue.trim(), updatedAt: Date.now() } : c,
    );
    setChats(next);
    saveChats(workspacePath, next);
    setRenamingId(null);
  }

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar__header">
        <span className="chat-sidebar__title">Chats</span>
        <button
          type="button"
          className="chat-sidebar__new-btn"
          title="New chat"
          onClick={createChat}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="chat-sidebar__list">
        {chats.length === 0 && (
          <div className="chat-sidebar__empty">
            <MessageSquare size={24} />
            <span>No chats yet</span>
            <button type="button" className="chat-sidebar__start-btn" onClick={createChat}>
              Start a chat
            </button>
          </div>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-sidebar__item${chat.id === activeChatId ? " chat-sidebar__item--active" : ""}`}
            onClick={() => onSelectChat(chat)}
          >
            {renamingId === chat.id ? (
              <input
                className="chat-sidebar__rename-input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(chat.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(chat.id);
                  if (e.key === "Escape") setRenamingId(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <MessageSquare size={13} className="chat-sidebar__item-icon" />
                <span className="chat-sidebar__item-name" onDoubleClick={(e) => startRename(chat, e)}>
                  {chat.name}
                </span>
                <span className="chat-sidebar__item-time">
                  <Clock size={10} />
                  {relativeTime(chat.updatedAt)}
                </span>
                <button
                  type="button"
                  className="chat-sidebar__item-del"
                  title="Delete"
                  onClick={(e) => deleteChat(chat.id, e)}
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
