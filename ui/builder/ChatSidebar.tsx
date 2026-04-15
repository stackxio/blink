import { useState } from "react";
import { Plus, MessageSquare, Trash2, Clock } from "lucide-react";
import { z } from "zod";

// ── Chat model ────────────────────────────────────────────────────────────────

const BuilderChatSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspacePath: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type BuilderChat = z.infer<typeof BuilderChatSchema>;

// ── Persistence helpers (used by BuilderLayout to own the state) ──────────────

export function chatsStorageKey(workspacePath: string) {
  return `codrift:builder-chats:${workspacePath}`;
}

export function activeChatStorageKey(workspacePath: string) {
  return `codrift:builder-active-chat:${workspacePath}`;
}

export function loadChats(workspacePath: string): BuilderChat[] {
  try {
    const raw = localStorage.getItem(chatsStorageKey(workspacePath));
    if (!raw) return [];
    const parsed = z.array(BuilderChatSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function persistChats(workspacePath: string, chats: BuilderChat[]) {
  localStorage.setItem(chatsStorageKey(workspacePath), JSON.stringify(chats));
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
  chats: BuilderChat[];
  activeChatId: string | null;
  streamingChatIds?: Set<string>;
  onSelectChat: (chat: BuilderChat) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, name: string) => void;
}

export default function ChatSidebar({
  chats,
  activeChatId,
  streamingChatIds,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function startRename(chat: BuilderChat, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(chat.id);
    setRenameValue(chat.name);
  }

  function commitRename(id: string) {
    if (renameValue.trim()) onRenameChat(id, renameValue.trim());
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
          onClick={onNewChat}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="chat-sidebar__list">
        {chats.length === 0 && (
          <div className="chat-sidebar__empty">
            <MessageSquare size={24} />
            <span>No chats yet</span>
            <button type="button" className="chat-sidebar__start-btn" onClick={onNewChat}>
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
                <span
                  className="chat-sidebar__item-name"
                  onDoubleClick={(e) => startRename(chat, e)}
                >
                  {chat.name}
                </span>
                {streamingChatIds?.has(chat.id) && chat.id !== activeChatId && (
                  <span className="chat-sidebar__item-badge" title="Agent is running" />
                )}
                <span className="chat-sidebar__item-time">
                  <Clock size={10} />
                  {relativeTime(chat.updatedAt)}
                </span>
                <button
                  type="button"
                  className="chat-sidebar__item-del"
                  title="Delete chat"
                  onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
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
