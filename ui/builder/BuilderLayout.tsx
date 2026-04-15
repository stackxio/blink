import { useState, useEffect, lazy, Suspense } from "react";
import { useAppStore } from "@/store";
import PanelResizer from "@/ide/layout/PanelResizer";
import ChatSidebar, { loadChats, type BuilderChat } from "./ChatSidebar";
import BrowserPanel from "./BrowserPanel";
import { loadAgentSettings, type AgentSettings } from "@/ai/agent-settings";

const CliAgentPanel = lazy(() => import("@/ai/CliAgentPanel"));

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

export default function BuilderLayout() {
  const ws = useAppStore((s) => s.activeWorkspace());
  const workspacePath = ws?.path ?? null;
  const workspaceName = ws?.name ?? null;

  const [widths, setWidths] = useState(loadBuilderWidths);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(loadAgentSettings);

  // Load or create initial chat when workspace changes
  useEffect(() => {
    if (!workspacePath) { setActiveChatId(null); return; }
    const existing = localStorage.getItem(`codrift:builder-active-chat:${workspacePath}`);
    const chats = loadChats(workspacePath);
    if (existing && chats.find((c) => c.id === existing)) {
      setActiveChatId(existing);
    } else if (chats.length > 0) {
      setActiveChatId(chats[0].id);
    } else {
      setActiveChatId(null);
    }
  }, [workspacePath]);

  function handleSelectChat(chat: BuilderChat) {
    setActiveChatId(chat.id);
    if (workspacePath) {
      localStorage.setItem(`codrift:builder-active-chat:${workspacePath}`, chat.id);
    }
  }

  function handleNewChat(chat: BuilderChat) {
    setActiveChatId(chat.id);
  }

  function setSidebarWidth(w: number) {
    const next = Math.max(160, Math.min(340, w));
    setWidths((prev) => {
      saveBuilderWidths(next, prev.browser);
      return { ...prev, sidebar: next };
    });
  }

  function setBrowserWidth(w: number) {
    const next = Math.max(300, Math.min(900, w));
    setWidths((prev) => {
      saveBuilderWidths(prev.sidebar, next);
      return { ...prev, browser: next };
    });
  }

  return (
    <div className="builder-layout">
      {/* Left: Chat sidebar */}
      <div className="builder-layout__sidebar" style={{ width: widths.sidebar }}>
        <ChatSidebar
          workspacePath={workspacePath}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
        />
      </div>

      <PanelResizer
        direction="horizontal"
        onResize={(delta) => setSidebarWidth(widths.sidebar + delta)}
      />

      {/* Center: Agent panel */}
      <div className="builder-layout__center">
        <Suspense fallback={<div className="builder-layout__loading">Loading agent…</div>}>
          <CliAgentPanel
            workspacePath={workspacePath}
            agentSettings={agentSettings}
            onSettings={() => {}}
          />
        </Suspense>
      </div>

      <PanelResizer
        direction="horizontal"
        onResize={(delta) => setBrowserWidth(widths.browser - delta)}
      />

      {/* Right: Browser preview */}
      <div className="builder-layout__browser" style={{ width: widths.browser }}>
        <BrowserPanel workspacePath={workspacePath} />
      </div>
    </div>
  );
}
