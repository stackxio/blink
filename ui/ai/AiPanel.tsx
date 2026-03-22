import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowUp, Square, ChevronDown, FileCode, SquarePen, X, MessageSquare } from "lucide-react";
import MessageBubble, { type Message, type Activity } from "./MessageBubble";
import { useAppStore } from "@/store";

interface DbMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface DbThread {
  id: string;
  folder_id: string | null;
  title: string;
  root_path_override: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface AiThread {
  id: string;
  title: string;
  createdAt: Date;
}

type ReasoningEffort = "xhigh" | "high" | "medium" | "low";
const REASONING_LABELS: Record<ReasoningEffort, string> = {
  xhigh: "Extra High", high: "High", medium: "Medium", low: "Low",
};

interface ModelOption { slug: string; label: string }
const GPT_MODELS: ModelOption[] = [
  { slug: "gpt-5.4", label: "GPT-5.4" },
  { slug: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { slug: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
];
const CLAUDE_MODELS: ModelOption[] = [
  { slug: "sonnet", label: "Sonnet" },
  { slug: "opus", label: "Opus" },
  { slug: "haiku", label: "Haiku" },
];

export default function AiPanel() {
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [activeProvider, setActiveProvider] = useState("codex");
  const [gptModel, setGptModel] = useState("gpt-5.4");
  const [claudeModel, setClaudeModel] = useState("sonnet");
  const [ollamaModel, setOllamaModel] = useState("llama3");
  const [ollamaModels, setOllamaModels] = useState<{ name: string }[]>([]);
  const [composerReasoning, setComposerReasoning] = useState<ReasoningEffort>("high");

  const [threadDropdownOpen, setThreadDropdownOpen] = useState(false);
  const threadDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const streamingThreadIdRef = useRef<string | null>(null);

  const ws = useAppStore((s) => s.activeWorkspace());
  const activeFile = ws && ws.activeFileIdx >= 0 ? ws.openFiles[ws.activeFileIdx] : null;

  // Close thread dropdown on outside click
  useEffect(() => {
    if (!threadDropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (threadDropdownRef.current && !threadDropdownRef.current.contains(e.target as Node)) setThreadDropdownOpen(false);
    }
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => document.removeEventListener("mousedown", onClick);
  }, [threadDropdownOpen]);

  // Load settings
  useEffect(() => {
    invoke<Record<string, unknown>>("get_settings").then((s) => {
      if (s.active_provider) setActiveProvider(s.active_provider as string);
      const ollama = s.ollama as Record<string, unknown> | undefined;
      if (ollama?.model) setOllamaModel(ollama.model as string);
      const codex = s.codex as Record<string, unknown> | undefined;
      if (codex?.model) setGptModel(codex.model as string);
    }).catch(() => {});
  }, []);

  // Load Ollama models when provider is ollama
  useEffect(() => {
    if (activeProvider !== "ollama") return;
    invoke<{ name: string }[]>("list_ollama_models").then((models) => {
      setOllamaModels(models);
      if (models.length > 0) {
        setOllamaModel((prev) => models.some((m) => m.name === prev) ? prev : models[0].name);
      }
    }).catch(() => {});
  }, [activeProvider]);

  // Reset on workspace switch
  useEffect(() => {
    setActiveThreadId(null);
    setMessages([]);
  }, [ws?.path]);

  // Load threads filtered by workspace
  useEffect(() => {
    invoke<DbThread[]>("list_threads").then((dbThreads) => {
      const wsPath = ws?.path ?? null;
      const filtered = wsPath
        ? dbThreads.filter((t) => t.root_path_override === wsPath || t.root_path_override === null)
        : dbThreads;
      setThreads(filtered.map((t) => ({ id: t.id, title: t.title, createdAt: new Date(t.created_at) })));
    }).catch(() => {});
  }, [ws?.path]);

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThreadId) { setMessages([]); return; }
    if (streamingThreadIdRef.current === activeThreadId) return;
    invoke<DbMessage[]>("list_messages", { threadId: activeThreadId }).then((dbMsgs) => {
      setMessages(dbMsgs.map((m) => ({
        id: m.id, role: m.role, content: m.content, timestamp: new Date(m.created_at),
      })));
    }).catch(() => setMessages([]));
  }, [activeThreadId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Draft auto-save
  useEffect(() => {
    const key = `caret:ai-draft:${activeThreadId ?? "new"}`;
    if (input) localStorage.setItem(key, input);
    else localStorage.removeItem(key);
  }, [input, activeThreadId]);

  // Restore draft on thread switch
  useEffect(() => {
    const saved = localStorage.getItem(`caret:ai-draft:${activeThreadId ?? "new"}`);
    setInput(saved ?? "");
  }, [activeThreadId]);

  async function createThread(): Promise<string> {
    const dbThread = await invoke<DbThread>("create_thread", {
      folderId: null, title: "New chat", scopeModeOverride: null, rootPathOverride: ws?.path ?? null,
    });
    const thread: AiThread = { id: dbThread.id, title: dbThread.title, createdAt: new Date(dbThread.created_at) };
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    return thread.id;
  }

  async function sendMessage(text: string, tid: string) {
    streamingThreadIdRef.current = tid;

    // Auto-title on first message
    if (messages.length === 0) {
      const title = text.length > 40 ? text.slice(0, 40) + "..." : text;
      setThreads((prev) => prev.map((t) => t.id === tid ? { ...t, title } : t));
      invoke("update_thread_title", { id: tid, title }).catch(() => {});
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Save to DB
    invoke("send_message", { threadId: tid, role: "user", content: text }).catch(() => {});

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date(), isStreaming: true }]);

    const unlistenChunk = await listen<{ chunk: string }>("chat:stream", (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + e.payload.chunk } : m));
    });

    const unlistenActivity = await listen<{ activity: Activity }>("chat:activity", (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, activities: [...(m.activities || []), e.payload.activity] } : m));
    });

    const unlistenDone = await listen<{ full_text: string }>("chat:done", async (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: e.payload.full_text, isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
      invoke("send_message", { threadId: tid, role: "assistant", content: e.payload.full_text }).catch(() => {});
      // Process queue
      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        setTimeout(() => sendMessage(next, tid), 0);
        return rest;
      });
    });

    const unlistenError = await listen<{ error: string }>("chat:error", (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${e.payload.error}`, isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
    });

    const unlistenCancelled = await listen<{ partial_text: string }>("chat:cancelled", async (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: e.payload.partial_text || "*(cancelled)*", isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
      if (e.payload.partial_text) {
        invoke("send_message", { threadId: tid, role: "assistant", content: e.payload.partial_text }).catch(() => {});
      }
    });

    function cleanup() { unlistenChunk(); unlistenActivity(); unlistenDone(); unlistenError(); unlistenCancelled(); }

    try {
      const sid = await invoke<string>("chat_stream", {
        input: { prompt: text, threadId: tid, runtimeMode: "full-access" },
      });
      sessionIdRef.current = sid;
    } catch (err: unknown) {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}`, isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    localStorage.removeItem(`caret:ai-draft:${activeThreadId ?? "new"}`);

    if (isLoading && activeThreadId) {
      setQueue((prev) => [...prev, text]);
      return;
    }

    let tid = activeThreadId;
    if (!tid) {
      tid = await createThread();
    }
    await sendMessage(text, tid);
  }

  async function handleCancel() {
    if (!sessionIdRef.current) return;
    setQueue([]);
    invoke("cancel_stream", { sessionId: sessionIdRef.current }).catch(() => {});
  }

  function handleNewChat() {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setQueue([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const recentThreads = threads.slice(0, 20);

  return (
    <div className="ai-panel">
      {/* Header with thread selector */}
      <div className="ai-panel__header">
        <div className="ai-panel__thread-picker" ref={threadDropdownRef}>
          <button
            type="button"
            className="ai-panel__thread-btn"
            onClick={() => setThreadDropdownOpen((v) => !v)}
          >
            <MessageSquare size={13} />
            <span>{activeThreadId ? (threads.find((t) => t.id === activeThreadId)?.title ?? "Chat") : "New Chat"}</span>
            <ChevronDown size={12} />
          </button>
          {threadDropdownOpen && (
            <div className="ai-panel__thread-dropdown">
              <button
                type="button"
                className="ai-panel__thread-option ai-panel__thread-option--new"
                onClick={() => { handleNewChat(); setThreadDropdownOpen(false); }}
              >
                <SquarePen size={13} />
                New Chat
              </button>
              {recentThreads.length > 0 && <div className="ai-panel__thread-sep" />}
              {recentThreads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ai-panel__thread-option ${t.id === activeThreadId ? "ai-panel__thread-option--active" : ""}`}
                  onClick={() => { setActiveThreadId(t.id); setThreadDropdownOpen(false); }}
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Context bar */}
      {activeFile && (
        <div className="ai-panel__context-bar">
          <FileCode size={12} />
          <span>{activeFile.name}</span>
        </div>
      )}

      {/* Messages */}
      <div className="ai-panel__messages">
        {messages.length === 0 ? (
          <div className="ai-panel__empty">
            <p>Start a conversation with AI.</p>
            <p>It can see your active file and workspace.</p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        {/* Queued messages */}
        {queue.map((text, i) => (
          <div key={`q-${i}`} className="chat-msg__queued">
            <span>{text}</span>
            <button type="button" onClick={() => setQueue((prev) => prev.filter((_, j) => j !== i))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="ai-panel__input-area">
        <div className="ai-panel__input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "Type to queue follow-up…" : "Ask about your code…"}
            rows={1}
            className="ai-panel__textarea"
          />
          {isLoading ? (
            <button type="button" className="ai-panel__stop" onClick={handleCancel}>
              <Square size={10} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="ai-panel__send" onClick={handleSend} disabled={!input.trim()}>
              <ArrowUp size={14} />
            </button>
          )}
        </div>
        {/* Model selector — single clean row */}
        <div className="ai-panel__model-bar">
          <select
            className="ai-panel__model-select"
            value={`${activeProvider}:${activeProvider === "codex" ? gptModel : activeProvider === "claude_code" ? claudeModel : activeProvider === "ollama" ? ollamaModel : "default"}`}
            onChange={async (e) => {
              const [provider, ...modelParts] = e.target.value.split(":");
              const model = modelParts.join(":"); // handle model names with colons like "qwen3:0.6b"
              setActiveProvider(provider);
              if (provider === "codex") setGptModel(model);
              else if (provider === "claude_code") setClaudeModel(model);
              else if (provider === "ollama") setOllamaModel(model);
              // Save to settings so backend uses the new provider/model
              try {
                const s = await invoke<Record<string, unknown>>("get_settings");
                const updated: Record<string, unknown> = { ...s, active_provider: provider };
                if (provider === "codex") updated.codex = { ...(s.codex as Record<string, unknown> ?? {}), model };
                if (provider === "claude_code") updated.claude_code = { ...(s.claude_code as Record<string, unknown> ?? {}), model };
                if (provider === "ollama") updated.ollama = { ...(s.ollama as Record<string, unknown> ?? {}), model };
                await invoke("save_settings", { settings: updated });
              } catch {}
            }}
          >
            <optgroup label="GPT">
              {GPT_MODELS.map((m) => <option key={m.slug} value={`codex:${m.slug}`}>{m.label}</option>)}
            </optgroup>
            <optgroup label="Claude">
              {CLAUDE_MODELS.map((m) => <option key={m.slug} value={`claude_code:${m.slug}`}>{m.label}</option>)}
            </optgroup>
            {ollamaModels.length > 0 && (
              <optgroup label="Ollama">
                {ollamaModels.map((m) => <option key={m.name} value={`ollama:${m.name}`}>{m.name}</option>)}
              </optgroup>
            )}
            <optgroup label="Other">
              <option value="custom:default">Custom API</option>
            </optgroup>
          </select>
        </div>
      </div>
    </div>
  );
}
