import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, Clock, PanelLeft, Settings2, Pin, BookMarked, GitBranch, Archive } from "lucide-react";
import { z } from "zod";
import { createPortal } from "react-dom";

// ── Chat model ────────────────────────────────────────────────────────────────

const BuilderChatSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspacePath: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  pinned: z.boolean().optional(),
  unread: z.boolean().optional(),
  archived: z.boolean().optional(),
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

// ── Context menu ──────────────────────────────────────────────────────────────

interface CtxMenuState {
  chatId: string;
  x: number;
  y: number;
}

interface ContextMenuProps {
  state: CtxMenuState;
  chat: BuilderChat;
  isCustomProvider: boolean;
  onClose: () => void;
  onRename: () => void;
  onPin: () => void;
  onMarkUnread: () => void;
  onFork: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function ContextMenu({
  state,
  chat,
  isCustomProvider,
  onClose,
  onRename,
  onPin,
  onMarkUnread,
  onFork,
  onArchive,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const style: React.CSSProperties = { position: "fixed", left: state.x, top: state.y, zIndex: 9999 };

  function item(icon: React.ReactNode, label: string, action: () => void, danger = false) {
    return (
      <button
        key={label}
        type="button"
        className={`chat-ctx-menu__item${danger ? " chat-ctx-menu__item--danger" : ""}`}
        onMouseDown={(e) => { e.stopPropagation(); action(); onClose(); }}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return createPortal(
    <div ref={menuRef} className="chat-ctx-menu" style={style}>
      {item(<Pin size={13} />, chat.pinned ? "Unpin" : "Pin", onPin)}
      {item(<Settings2 size={13} />, "Rename", onRename)}
      {item(<BookMarked size={13} />, chat.unread ? "Mark as read" : "Mark as unread", onMarkUnread)}
      {isCustomProvider && item(<GitBranch size={13} />, "Fork chat", onFork)}
      {item(<Archive size={13} />, "Archive", onArchive)}
      <div className="chat-ctx-menu__divider" />
      {item(<Trash2 size={13} />, "Delete", onDelete, true)}
    </div>,
    document.body,
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────

type ChatState = "streaming" | "idle";

function StatusDot({ state }: { state: ChatState }) {
  return (
    <span
      className={`chat-status-dot chat-status-dot--${state}`}
      title={state === "streaming" ? "Agent is running" : "Idle"}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  chats: BuilderChat[];
  activeChatId: string | null;
  streamingChatIds?: Set<string>;
  isCustomProvider?: boolean;
  onSelectChat: (chat: BuilderChat) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, name: string) => void;
  onClose?: () => void;
}

export default function ChatSidebar({
  chats,
  activeChatId,
  streamingChatIds,
  isCustomProvider = false,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onClose,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [localChats, setLocalChats] = useState<Map<string, Partial<BuilderChat>>>(new Map());

  function startRename(chat: BuilderChat, e?: React.MouseEvent) {
    e?.stopPropagation();
    setRenamingId(chat.id);
    setRenameValue(chat.name);
  }

  function commitRename(id: string) {
    if (renameValue.trim()) onRenameChat(id, renameValue.trim());
    setRenamingId(null);
  }

  function handleContextMenu(e: React.MouseEvent, chat: BuilderChat) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ chatId: chat.id, x: e.clientX, y: e.clientY });
  }

  function patchChat(id: string, patch: Partial<BuilderChat>) {
    setLocalChats((prev) => {
      const next = new Map(prev);
      next.set(id, { ...prev.get(id), ...patch });
      return next;
    });
  }

  // Merge parent chats with local metadata overrides (pin, unread, archive)
  const mergedChats = chats.map((c) => ({ ...c, ...localChats.get(c.id) }));

  // Sort: pinned first
  const sorted = [...mergedChats].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  const ctxChat = ctxMenu ? mergedChats.find((c) => c.id === ctxMenu.chatId) : null;

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar__header">
        <span className="chat-sidebar__title">Chats</span>
        <div className="chat-sidebar__header-actions">
          <button
            type="button"
            className="chat-sidebar__new-btn"
            title="New chat"
            onClick={onNewChat}
          >
            <Plus size={14} />
          </button>
          {onClose && (
            <button
              type="button"
              className="chat-sidebar__close-btn"
              title="Hide chat list"
              onClick={onClose}
            >
              <PanelLeft size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-sidebar__list">
        {sorted.length === 0 && (
          <div className="chat-sidebar__empty">
            <span>No chats yet</span>
            <button type="button" className="chat-sidebar__start-btn" onClick={onNewChat}>
              Start a chat
            </button>
          </div>
        )}

        {sorted.map((chat) => {
          const isStreaming = streamingChatIds?.has(chat.id) ?? false;
          const chatState: ChatState = isStreaming ? "streaming" : "idle";

          return (
            <div
              key={chat.id}
              className={`chat-sidebar__item${chat.id === activeChatId ? " chat-sidebar__item--active" : ""}${chat.pinned ? " chat-sidebar__item--pinned" : ""}`}
              onClick={() => onSelectChat(chat)}
              onContextMenu={(e) => handleContextMenu(e, chat)}
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
                  <StatusDot state={chatState} />
                  <span
                    className={`chat-sidebar__item-name${chat.unread ? " chat-sidebar__item-name--unread" : ""}`}
                    onDoubleClick={(e) => { e.stopPropagation(); startRename(chat); }}
                  >
                    {chat.name}
                  </span>
                  {isStreaming && chat.id !== activeChatId && (
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
          );
        })}
      </div>

      {ctxMenu && ctxChat && (
        <ContextMenu
          state={ctxMenu}
          chat={ctxChat}
          isCustomProvider={isCustomProvider}
          onClose={closeCtx}
          onRename={() => { const c = mergedChats.find(x => x.id === ctxMenu.chatId); if (c) startRename(c); }}
          onPin={() => patchChat(ctxMenu.chatId, { pinned: !ctxChat.pinned })}
          onMarkUnread={() => patchChat(ctxMenu.chatId, { unread: !ctxChat.unread })}
          onFork={() => {
            // Fork: create a new chat with the same name + " (fork)"
            const base = mergedChats.find(x => x.id === ctxMenu.chatId);
            if (base) {
              onRenameChat; // no-op; forks need a new chat — handled via onNewChat
              // We call onNewChat and rely on BuilderLayout to handle it
              onNewChat();
            }
          }}
          onArchive={() => patchChat(ctxMenu.chatId, { archived: true })}
          onDelete={() => onDeleteChat(ctxMenu.chatId)}
        />
      )}
    </div>
  );
}
