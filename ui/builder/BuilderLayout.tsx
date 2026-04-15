import { useState, useEffect, lazy, Suspense } from "react";
import { PanelRight, PanelLeft } from "lucide-react";
import { useAppStore } from "@/store";
import PanelResizer from "@/ide/layout/PanelResizer";
import ChatSidebar, {
  loadChats,
  persistChats,
  activeChatStorageKey,
  type BuilderChat,
} from "./ChatSidebar";
import BrowserPanel from "./BrowserPanel";
import { loadAgentSettings, type AgentSettings } from "@/ai/agent-settings";

const CliAgentPanel = lazy(() => import("@/ai/CliAgentPanel"));

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

function makeChat(workspacePath: string): BuilderChat {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: `Chat ${new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    workspacePath,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuilderLayout() {
  const ws = useAppStore((s) => s.activeWorkspace());
  const workspacePath = ws?.path ?? null;

  const [widths, setWidths] = useState(loadBuilderWidths);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [chats, setChats] = useState<BuilderChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [agentSettings] = useState<AgentSettings>(loadAgentSettings);
  const [streamingChatIds, setStreamingChatIds] = useState<Set<string>>(new Set());

  function handleStreamingChange(chatId: string, streaming: boolean) {
    setStreamingChatIds((prev) => {
      const next = new Set(prev);
      if (streaming) next.add(chatId);
      else next.delete(chatId);
      return next;
    });
  }

  // Load chats for the active workspace; auto-create first chat if none exist
  useEffect(() => {
    if (!workspacePath) {
      setChats([]);
      setActiveChatId(null);
      return;
    }

    let loaded = loadChats(workspacePath);

    // Auto-create a chat if this workspace has none yet
    if (loaded.length === 0) {
      const first = makeChat(workspacePath);
      loaded = [first];
      persistChats(workspacePath, loaded);
    }

    setChats(loaded);

    // Restore the last active chat (or default to first)
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
    if (workspacePath) {
      localStorage.setItem(activeChatStorageKey(workspacePath), chat.id);
    }
  }

  function handleDeleteChat(id: string) {
    if (!workspacePath) return;
    const next = chats.filter((c) => c.id !== id);

    // Always keep at least one chat
    if (next.length === 0) {
      const replacement = makeChat(workspacePath);
      next.push(replacement);
    }

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
    const next = chats.map((c) =>
      c.id === id ? { ...c, name, updatedAt: Date.now() } : c,
    );
    setChats(next);
    persistChats(workspacePath, next);
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

  return (
    <div className="builder-layout">
      {/* Left: Chat sidebar (collapsible) */}
      {sidebarOpen && (
        <>
          <div className="builder-layout__sidebar" style={{ width: widths.sidebar }}>
            <ChatSidebar
              chats={chats}
              activeChatId={activeChatId}
              streamingChatIds={streamingChatIds}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewChat}
              onDeleteChat={handleDeleteChat}
              onRenameChat={handleRenameChat}
            />
          </div>
          <PanelResizer direction="horizontal" onResize={(d) => setSidebarWidth(widths.sidebar + d)} />
        </>
      )}

      {/* Center: One CliAgentPanel per chat — all mounted, CSS-hidden when inactive.
          This keeps PTY sessions and terminal state alive while switching chats. */}
      <div className="builder-layout__center">
        {/* Top-left: sidebar toggle */}
        <button
          type="button"
          className={`builder-layout__sidebar-toggle${sidebarOpen ? " builder-layout__sidebar-toggle--active" : ""}`}
          title={sidebarOpen ? "Hide chats" : "Show chats"}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <PanelLeft size={14} />
        </button>

        {/* Top-right: browser toggle */}
        <button
          type="button"
          className={`builder-layout__browser-toggle${browserOpen ? " builder-layout__browser-toggle--active" : ""}`}
          title={browserOpen ? "Hide browser" : "Show browser"}
          onClick={() => setBrowserOpen((v) => !v)}
        >
          <PanelRight size={14} />
        </button>

        <Suspense fallback={<div className="builder-layout__loading">Loading…</div>}>
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="builder-layout__agent-pane"
              style={{ display: chat.id === activeChatId ? "flex" : "none" }}
            >
              <CliAgentPanel
                workspacePath={workspacePath}
                chatId={chat.id}
                agentSettings={agentSettings}
                onSettings={() => {}}
                onStreamingChange={(streaming) => handleStreamingChange(chat.id, streaming)}
              />
            </div>
          ))}
        </Suspense>

        {chats.length === 0 && (
          <div className="builder-layout__loading">No workspace open</div>
        )}
      </div>

      {/* Right: Browser preview (hideable) */}
      {browserOpen && (
        <>
          <PanelResizer
            direction="horizontal"
            onResize={(d) => setBrowserWidth(widths.browser - d)}
          />
          <div className="builder-layout__browser" style={{ width: widths.browser }}>
            <BrowserPanel workspacePath={workspacePath} />
          </div>
        </>
      )}
    </div>
  );
}
