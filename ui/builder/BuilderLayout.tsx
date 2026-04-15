import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAppStore } from "@/store";
import PanelResizer from "@/ide/layout/PanelResizer";
import ChatSidebar, {
  loadChats,
  persistChats,
  activeChatStorageKey,
  type BuilderChat,
} from "./ChatSidebar";
import BrowserPanel from "./BrowserPanel";
import { chatMessagesKey } from "@/ai/BlinkCodePanel";

const BlinkCodePanel = lazy(() => import("@/ai/BlinkCodePanel"));

// ── Width persistence ─────────────────────────────────────────────────────────

const DEFAULT_SIDEBAR_WIDTH = 220;
const DEFAULT_BROWSER_WIDTH = 480;

function loadBuilderWidths(): { sidebar: number; browser: number } {
  try {
    const raw = localStorage.getItem("codrift:builder-widths");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sidebar: DEFAULT_SIDEBAR_WIDTH, browser: DEFAULT_BROWSER_WIDTH };
}

function saveBuilderWidths(sidebar: number, browser: number) {
  localStorage.setItem("codrift:builder-widths", JSON.stringify({ sidebar, browser }));
}

// ── Chat factory ──────────────────────────────────────────────────────────────

function makeChat(workspacePath: string, name = "New Chat"): BuilderChat {
  const now = Date.now();
  return { id: crypto.randomUUID(), name, workspacePath, createdAt: now, updatedAt: now };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuilderLayout() {
  const ws = useAppStore((s) => s.activeWorkspace());
  const workspacePath = ws?.path ?? null;
  const browserOpen = useAppStore((s) => s.builderBrowserOpen);
  const sidebarOpen = useAppStore((s) => s.builderSidebarOpen);
  const isCustomProvider = useAppStore((s) => s.blinkCodeProviderType === "openai-compat");

  const [widths, setWidths] = useState(loadBuilderWidths);
  const [chats, setChats] = useState<BuilderChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [streamingChatIds, setStreamingChatIds] = useState<Set<string>>(new Set());

  const handleStreamingChange = useCallback((chatId: string, streaming: boolean) => {
    setStreamingChatIds((prev) => {
      // Bail early if nothing actually changes — avoids a re-render that would
      // create a new onStreamingChange reference and trigger an infinite loop.
      if (streaming && prev.has(chatId)) return prev;
      if (!streaming && !prev.has(chatId)) return prev;
      const next = new Set(prev);
      if (streaming) next.add(chatId);
      else next.delete(chatId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!workspacePath) { setChats([]); setActiveChatId(null); return; }
    let loaded = loadChats(workspacePath);
    if (loaded.length === 0) {
      const first = makeChat(workspacePath);
      loaded = [first];
      persistChats(workspacePath, loaded);
    }
    setChats(loaded);
    const savedActive = localStorage.getItem(activeChatStorageKey(workspacePath));
    const valid = loaded.find((c) => c.id === savedActive);
    setActiveChatId(valid?.id ?? loaded[0].id);
  }, [workspacePath]);

  // ── Chat actions ────────────────────────────────────────────────────────────

  function handleNewChat() {
    if (!workspacePath) return;
    const chat = makeChat(workspacePath);
    const next = [chat, ...chats];
    setChats(next);
    persistChats(workspacePath, next);
    setActiveChatId(chat.id);
    localStorage.setItem(activeChatStorageKey(workspacePath), chat.id);
  }

  function handleSelectChat(chat: BuilderChat) {
    setActiveChatId(chat.id);
    if (workspacePath) localStorage.setItem(activeChatStorageKey(workspacePath), chat.id);
  }

  function handleDeleteChat(id: string) {
    if (!workspacePath) return;
    // Clean up persisted messages for this chat
    localStorage.removeItem(chatMessagesKey(id));
    const next = chats.filter((c) => c.id !== id);
    if (next.length === 0) next.push(makeChat(workspacePath));
    setChats(next);
    persistChats(workspacePath, next);
    if (activeChatId === id) {
      const fallback = next[0];
      setActiveChatId(fallback.id);
      localStorage.setItem(activeChatStorageKey(workspacePath), fallback.id);
    }
  }

  function handleRenameChat(id: string, name: string) {
    if (!workspacePath) return;
    const next = chats.map((c) => c.id === id ? { ...c, name, updatedAt: Date.now() } : c);
    setChats(next);
    persistChats(workspacePath, next);
  }

  function handleUpdateChat(id: string, patch: Partial<BuilderChat>) {
    if (!workspacePath) return;
    const next = chats.map((c) => c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c);
    setChats(next);
    persistChats(workspacePath, next);
  }

  function handleForkChat(id: string) {
    if (!workspacePath) return;
    const original = chats.find((c) => c.id === id);
    if (!original) return;

    const fork = makeChat(workspacePath, `Fork of ${original.name}`);

    // Copy persisted messages from original to fork
    try {
      const raw = localStorage.getItem(chatMessagesKey(id));
      if (raw) localStorage.setItem(chatMessagesKey(fork.id), raw);
    } catch {}

    // Insert fork right after the original
    const idx = chats.findIndex((c) => c.id === id);
    const next = [...chats.slice(0, idx + 1), fork, ...chats.slice(idx + 1)];
    setChats(next);
    persistChats(workspacePath, next);
    setActiveChatId(fork.id);
    localStorage.setItem(activeChatStorageKey(workspacePath), fork.id);
  }

  // ── Panel resizing ──────────────────────────────────────────────────────────

  function setSidebarWidth(w: number) {
    const clamped = Math.max(160, Math.min(340, w));
    setWidths((prev) => { saveBuilderWidths(clamped, prev.browser); return { ...prev, sidebar: clamped }; });
  }

  function setBrowserWidth(w: number) {
    const clamped = Math.max(300, Math.min(900, w));
    setWidths((prev) => { saveBuilderWidths(prev.sidebar, clamped); return { ...prev, browser: clamped }; });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Filter out archived chats from the visible list
  const visibleChats = chats.filter((c) => !c.archived);

  return (
    <div className="builder-layout">
      {sidebarOpen && (
        <>
          <div className="builder-layout__sidebar" style={{ width: widths.sidebar }}>
            <ChatSidebar
              chats={visibleChats}
              activeChatId={activeChatId}
              streamingChatIds={streamingChatIds}
              isCustomProvider={isCustomProvider}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewChat}
              onDeleteChat={handleDeleteChat}
              onRenameChat={handleRenameChat}
              onUpdateChat={handleUpdateChat}
              onForkChat={handleForkChat}
            />
          </div>
          <PanelResizer direction="horizontal" onResize={(d) => setSidebarWidth(widths.sidebar + d)} />
        </>
      )}

      {/* All chats mounted; CSS-hidden when inactive to keep PTY/chat state alive */}
      <div className="builder-layout__center">
        <Suspense fallback={<div className="builder-layout__loading">Loading…</div>}>
          {chats.filter((c) => !c.archived).map((chat) => (
            <div
              key={chat.id}
              className="builder-layout__agent-pane"
              style={{ display: chat.id === activeChatId ? "flex" : "none" }}
            >
              <BlinkCodePanel
                chatId={chat.id}
                onStreamingChange={(streaming) => handleStreamingChange(chat.id, streaming)}
              />
            </div>
          ))}
        </Suspense>
        {chats.length === 0 && (
          <div className="builder-layout__loading">No workspace open</div>
        )}
      </div>

      {browserOpen && (
        <>
          <PanelResizer direction="horizontal" onResize={(d) => setBrowserWidth(widths.browser - d)} />
          <div className="builder-layout__browser" style={{ width: widths.browser }}>
            <BrowserPanel workspacePath={workspacePath} />
          </div>
        </>
      )}
    </div>
  );
}
