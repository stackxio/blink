import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useOutletContext, useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronUp, MessageCircle, Lock, LockOpen } from "lucide-react";
import MessageBubble from "@/components/MessageBubble";
import type { Message, Activity } from "@/components/MessageBubble";

interface ChatContext {
  onLoadingChange: (loading: boolean) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onNewThread: (folderId?: string | null) => void;
  createThread: (folderId?: string | null) => Promise<{ id: string; title: string }>;
  pendingFolderIdRef: React.MutableRefObject<string | null>;
  activeThreadId: string | null;
}

interface DbMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function dbMessageToMessage(db: DbMessage): Message {
  return {
    id: db.id,
    role: db.role,
    content: db.content,
    timestamp: new Date(db.created_at),
  };
}

type ReasoningEffort = "xhigh" | "high" | "medium" | "low";
const REASONING_LABELS: Record<ReasoningEffort, string> = {
  xhigh: "Extra High",
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface ModelOption { slug: string; label: string }

const GPT_MODELS: ModelOption[] = [
  { slug: "gpt-5.4", label: "GPT-5.4" },
  { slug: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { slug: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { slug: "gpt-5.2", label: "GPT-5.2" },
  { slug: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
  { slug: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
];

const CLAUDE_MODELS: ModelOption[] = [
  { slug: "sonnet", label: "Sonnet" },
  { slug: "opus", label: "Opus" },
  { slug: "haiku", label: "Haiku" },
];

const SUGGESTIONS = [
  {
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
        />
      </svg>
    ),
    label: "Optimize my week",
  },
  {
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
        />
      </svg>
    ),
    label: "Organize my files",
  },
  {
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
      </svg>
    ),
    label: "Find insights in files",
  },
];

export default function ChatArea() {
  const { onLoadingChange, onRenameThread, createThread, pendingFolderIdRef } = useOutletContext<ChatContext>();
  const { threadId } = useParams();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [followUpBehavior, setFollowUpBehavior] = useState<"queue" | "steer">("queue");
  const [showActionsInChat, setShowActionsInChat] = useState(true);
  const [activeProvider, setActiveProvider] = useState<string>("codex");
  const [composerReasoning, setComposerReasoning] = useState<ReasoningEffort>("high");
  const [composerFastMode, setComposerFastMode] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"default" | "plan">("default");
  const [runtimeMode, setRuntimeMode] = useState<"full-access" | "approval-required">("full-access");
  const [ollamaModels, setOllamaModels] = useState<{ name: string; size: number; parameter_size: string }[]>([]);
  const [ollamaModel, setOllamaModel] = useState<string>("llama3");
  const [ollamaMenuOpen, setOllamaMenuOpen] = useState(false);
  const [ollamaMenuRect, setOllamaMenuRect] = useState<DOMRect | null>(null);
  const [ollamaSearch, setOllamaSearch] = useState("");
  const [gptModel, setGptModel] = useState("gpt-5.4");
  const [claudeModel, setClaudeModel] = useState("sonnet");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMenuRect, setModelMenuRect] = useState<DOMRect | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const ollamaMenuRef = useRef<HTMLDivElement>(null);
  const ollamaTriggerRef = useRef<HTMLButtonElement>(null);
  const ollamaDropdownRef = useRef<HTMLDivElement>(null);
  const reasoningMenuRef = useRef<HTMLDivElement>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);
  const providerTriggerRef = useRef<HTMLButtonElement>(null);
  const reasoningTriggerRef = useRef<HTMLButtonElement>(null);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const reasoningDropdownRef = useRef<HTMLDivElement>(null);
  const [providerMenuRect, setProviderMenuRect] = useState<DOMRect | null>(null);
  const [reasoningMenuRect, setReasoningMenuRect] = useState<DOMRect | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Track active stream session for cancellation
  const sessionIdRef = useRef<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    invoke<{
      follow_up_behavior?: string;
      show_actions_in_chat?: boolean;
      active_provider?: string;
      ollama?: { model?: string };
      codex?: { model?: string };
      claude_code?: { model?: string };
    }>("get_settings")
      .then((s) => {
        setFollowUpBehavior((s.follow_up_behavior === "steer" ? "steer" : "queue") as "queue" | "steer");
        setShowActionsInChat(s.show_actions_in_chat !== false);
        setActiveProvider(s.active_provider ?? "codex");
        if (s.ollama?.model) setOllamaModel(s.ollama.model);
        if (s.codex?.model) setGptModel(s.codex.model);
        if (s.claude_code?.model) setClaudeModel(s.claude_code.model);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeProvider === "ollama") {
      invoke<{ name: string; size: number; parameter_size: string }[]>("list_ollama_models")
        .then(setOllamaModels)
        .catch(() => setOllamaModels([]));
    }
  }, [activeProvider]);

  // Close composer dropdowns on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inProvider =
        providerMenuRef.current?.contains(target) ||
        providerDropdownRef.current?.contains(target);
      const inReasoning =
        reasoningMenuRef.current?.contains(target) ||
        reasoningDropdownRef.current?.contains(target);
      const inOllama =
        ollamaMenuRef.current?.contains(target) ||
        ollamaDropdownRef.current?.contains(target);
      const inModel =
        modelMenuRef.current?.contains(target) ||
        modelDropdownRef.current?.contains(target);
      if (inProvider || inReasoning || inOllama || inModel) return;
      setProviderMenuOpen(false);
      setReasoningMenuOpen(false);
      setOllamaMenuOpen(false);
      setModelMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function closeAllMenus() {
    setProviderMenuOpen(false);
    setProviderMenuRect(null);
    setModelMenuOpen(false);
    setModelMenuRect(null);
    setReasoningMenuOpen(false);
    setReasoningMenuRect(null);
    setOllamaMenuOpen(false);
    setOllamaMenuRect(null);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load messages from db when thread changes
  useEffect(() => {
    inputRef.current?.focus();

    if (!threadId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        const dbMessages = await invoke<DbMessage[]>("list_messages", { threadId });
        if (!cancelled) {
          setMessages(dbMessages.map(dbMessageToMessage));
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
        }
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [threadId]);


  const updateLoading = useCallback(
    (value: boolean) => {
      setIsLoading(value);
      onLoadingChange(value);
    },
    [onLoadingChange],
  );

  async function sendMessage(text: string, tid: string) {
    // Only rename thread on the very first message
    if (messages.length === 0) {
      const title = text.length > 40 ? text.slice(0, 40) + "..." : text;
      onRenameThread(tid, title);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    updateLoading(true);

    // Save user message to db
    try {
      await invoke("send_message", {
        threadId: tid,
        role: "user",
        content: text,
      });
    } catch {
      // Non-critical
    }

    // Create assistant message placeholder for streaming
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: new Date(), isStreaming: true },
    ]);

    const unlistenChunk = await listen<{ chunk: string }>("chat:stream", (event) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: msg.content + event.payload.chunk } : msg,
        ),
      );
    });

    const unlistenActivity = await listen<{ activity: Activity }>("chat:activity", (event) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, activities: [...(msg.activities || []), event.payload.activity] }
            : msg,
        ),
      );
    });

    const unlistenDone = await listen<{ full_text: string }>("chat:done", async (event) => {
      const { full_text } = event.payload;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: full_text, isStreaming: false } : msg,
        ),
      );
      updateLoading(false);
      sessionIdRef.current = null;
      cleanup();

      try {
        await invoke("send_message", {
          threadId: tid,
          role: "assistant",
          content: full_text,
        });
      } catch {
        // Non-critical
      }

      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        setTimeout(() => sendMessage(next, tid), 0);
        return rest;
      });
    });

    const unlistenError = await listen<{ error: string }>("chat:error", (event) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `Error: ${event.payload.error}`, isStreaming: false }
            : msg,
        ),
      );
      updateLoading(false);
      sessionIdRef.current = null;
      cleanup();

      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        setTimeout(() => sendMessage(next, tid), 0);
        return rest;
      });
    });

    const unlistenCancelled = await listen<{ partial_text: string }>(
      "chat:cancelled",
      async (event) => {
        const { partial_text } = event.payload;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: partial_text || "*(cancelled)*", isStreaming: false }
              : msg,
          ),
        );
        updateLoading(false);
        sessionIdRef.current = null;
        cleanup();

        if (partial_text) {
          try {
            await invoke("send_message", {
              threadId: tid,
              role: "assistant",
              content: partial_text,
            });
          } catch {
            // Non-critical
          }
        }

        setQueue((prev) => {
          if (prev.length === 0) return prev;
          const [next, ...rest] = prev;
          setTimeout(() => sendMessage(next, tid), 0);
          return rest;
        });
      },
    );

    function cleanup() {
      unlistenChunk();
      unlistenActivity();
      unlistenDone();
      unlistenError();
      unlistenCancelled();
    }

    try {
      const sid = await invoke<string>("chat_stream", {
        input: {
          prompt: text,
          threadId: tid,
          ...(activeProvider === "codex"
            ? { reasoningEffort: composerReasoning, fastMode: composerFastMode }
            : {}),
        },
      });
      sessionIdRef.current = sid;
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `Error: ${errorText}`, isStreaming: false }
            : msg,
        ),
      );
      updateLoading(false);
      sessionIdRef.current = null;
      cleanup();

      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        setTimeout(() => sendMessage(next, tid), 0);
        return rest;
      });
    }
  }

  async function handleCancel() {
    if (!sessionIdRef.current) return;
    try {
      await invoke("cancel_stream", { sessionId: sessionIdRef.current });
    } catch {
      // Session may already be done
    }
  }

  async function steerQueuedMessage(index: number) {
    const text = queue[index];
    if (text === undefined || !threadId) return;
    setQueue((prev) => prev.filter((_, i) => i !== index));
    await handleCancel();
    await sendMessage(text, threadId);
  }

  async function handleOllamaModelChange(model: string) {
    setOllamaModel(model);
    try {
      const s = await invoke<Record<string, unknown>>("get_settings");
      const ollama = (s.ollama as Record<string, unknown>) ?? {};
      await invoke("save_settings", {
        settings: { ...s, ollama: { ...ollama, model } },
      });
    } catch {
      // Non-critical
    }
  }

  async function handleModelChange(provider: string, model: string) {
    if (provider === "codex") setGptModel(model);
    else if (provider === "claude_code") setClaudeModel(model);
    try {
      const s = await invoke<Record<string, unknown>>("get_settings");
      if (provider === "codex") {
        const codex = (s.codex as Record<string, unknown>) ?? {};
        await invoke("save_settings", { settings: { ...s, codex: { ...codex, model } } });
      } else if (provider === "claude_code") {
        const claude_code = (s.claude_code as Record<string, unknown>) ?? {};
        await invoke("save_settings", { settings: { ...s, claude_code: { ...claude_code, model } } });
      }
    } catch {
      // Non-critical
    }
  }

  async function handleProviderChange(provider: string) {
    setActiveProvider(provider);
    setModelMenuOpen(false);
    setModelMenuRect(null);
    try {
      const s = await invoke<Record<string, unknown>>("get_settings");
      await invoke("save_settings", { settings: { ...s, active_provider: provider } });
    } catch {
      // Non-critical
    }
  }

  async function handleSubmit(e: FormEvent, opts?: { forceSteer?: boolean; forceQueue?: boolean }) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    if (isLoading && threadId) {
      if (opts?.forceQueue) {
        setQueue((prev) => [...prev, text]);
        setInput("");
        return;
      }
      if (opts?.forceSteer || followUpBehavior === "steer") {
        setInput("");
        await handleCancel();
        await sendMessage(text, threadId);
      } else {
        setQueue((prev) => [...prev, text]);
        setInput("");
      }
      return;
    }

    setInput("");

    if (threadId) {
      await sendMessage(text, threadId);
    } else {
      try {
        const folderId = pendingFolderIdRef.current;
        pendingFolderIdRef.current = null;
        const thread = await createThread(folderId);
        await sendMessage(text, thread.id);
      } catch {
        // Thread creation failed — nothing to do
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter") {
      if (e.shiftKey && e.metaKey) {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent, {
          forceSteer: followUpBehavior === "queue",
          forceQueue: followUpBehavior === "steer",
        });
        return;
      }
      if (!e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent);
      }
    }
  }

  const inputBox = (
    <div className="rounded-xl border border-border bg-input focus-within:border-muted-foreground">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isLoading ? "Ask for follow-up changes" : "How can I help you today?"}
        rows={1}
        className="block w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none"
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Provider dropdown */}
          <div className="relative shrink-0" ref={providerMenuRef}>
            <button
              ref={providerTriggerRef}
              type="button"
              onClick={() => {
                const opening = !providerMenuOpen;
                closeAllMenus();
                if (opening) {
                  setProviderMenuOpen(true);
                  setProviderMenuRect(providerTriggerRef.current?.getBoundingClientRect() ?? null);
                }
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <span>{{ codex: "GPT", claude_code: "Claude", ollama: "Ollama", custom: "Custom" }[activeProvider] ?? activeProvider}</span>
              <ChevronUp className="h-3 w-3 opacity-70" />
            </button>
            {providerMenuOpen &&
              providerMenuRect &&
              createPortal(
                <div
                  ref={providerDropdownRef}
                  className="fixed z-[9999] min-w-[120px] rounded-lg border border-border bg-surface py-1 shadow-xl"
                  style={{
                    top: providerMenuRect.top - 4,
                    left: providerMenuRect.left,
                    transform: "translateY(-100%)",
                    backgroundColor: "var(--color-surface, #171717)",
                    color: "var(--color-foreground, #fafafa)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px var(--color-border, rgba(255,255,255,0.1))",
                  }}
                >
                  {(["codex", "claude_code", "ollama", "custom"] as const).map((p) => {
                    const label: Record<string, string> = { codex: "GPT", claude_code: "Claude", ollama: "Ollama", custom: "Custom" };
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          handleProviderChange(p);
                          setProviderMenuOpen(false);
                          setProviderMenuRect(null);
                        }}
                        className={`block w-full px-3 py-1.5 text-left text-xs ${
                          activeProvider === p ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:bg-surface-raised"
                        }`}
                      >
                        {label[p] ?? p}
                      </button>
                    );
                  })}
                </div>,
                document.body
              )}
          </div>

          {(activeProvider === "codex" || activeProvider === "claude_code") && (() => {
            const models = activeProvider === "codex" ? GPT_MODELS : CLAUDE_MODELS;
            const currentModel = activeProvider === "codex" ? gptModel : claudeModel;
            const currentLabel = models.find((m) => m.slug === currentModel)?.label ?? currentModel;
            return (
              <>
                <span className="h-4 w-px shrink-0 bg-border" />
                <div className="relative shrink-0" ref={modelMenuRef}>
                  <button
                    ref={modelTriggerRef}
                    type="button"
                    onClick={() => {
                      const opening = !modelMenuOpen;
                      closeAllMenus();
                      if (opening) {
                        setModelMenuOpen(true);
                        setModelMenuRect(modelTriggerRef.current?.getBoundingClientRect() ?? null);
                      }
                    }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                  >
                    <span className="max-w-[120px] truncate">{currentLabel}</span>
                    <ChevronUp className="h-3 w-3 opacity-70" />
                  </button>
                  {modelMenuOpen &&
                    modelMenuRect &&
                    createPortal(
                      <div
                        ref={modelDropdownRef}
                        className="fixed z-[9999] min-w-[160px] rounded-lg border border-border bg-surface py-1 shadow-xl"
                        style={{
                          top: modelMenuRect.top - 4,
                          left: modelMenuRect.left,
                          transform: "translateY(-100%)",
                          backgroundColor: "var(--color-surface, #171717)",
                          color: "var(--color-foreground, #fafafa)",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px var(--color-border, rgba(255,255,255,0.1))",
                        }}
                      >
                        <div className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                          Model
                        </div>
                        {models.map((m) => (
                          <button
                            key={m.slug}
                            type="button"
                            onClick={() => {
                              handleModelChange(activeProvider, m.slug);
                              setModelMenuOpen(false);
                              setModelMenuRect(null);
                            }}
                            className={`block w-full px-3 py-1.5 text-left text-xs ${
                              currentModel === m.slug ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:bg-surface-raised"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                </div>
              </>
            );
          })()}

          {activeProvider === "codex" && (
            <>
              <span className="h-4 w-px shrink-0 bg-border" />
              <div className="relative shrink-0" ref={reasoningMenuRef}>
                <button
                  ref={reasoningTriggerRef}
                  type="button"
                  onClick={() => {
                    const opening = !reasoningMenuOpen;
                    closeAllMenus();
                    if (opening) {
                      setReasoningMenuOpen(true);
                      setReasoningMenuRect(reasoningTriggerRef.current?.getBoundingClientRect() ?? null);
                    }
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  <span>
                    {REASONING_LABELS[composerReasoning]}
                    {composerFastMode ? " · Fast" : ""}
                  </span>
                  <ChevronUp className="h-3 w-3 opacity-70" />
                </button>
                {reasoningMenuOpen &&
                  reasoningMenuRect &&
                  createPortal(
                    <div
                      ref={reasoningDropdownRef}
                      className="fixed z-[9999] min-w-[140px] rounded-lg border border-border bg-surface py-1 shadow-xl"
                      style={{
                        top: reasoningMenuRect.top - 4,
                        left: reasoningMenuRect.left,
                        transform: "translateY(-100%)",
                        backgroundColor: "var(--color-surface, #171717)",
                        color: "var(--color-foreground, #fafafa)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px var(--color-border, rgba(255,255,255,0.1))",
                      }}
                    >
                      <div className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                        Reasoning
                      </div>
                      {(["xhigh", "high", "medium", "low"] as const).map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            setComposerReasoning(e);
                            setReasoningMenuOpen(false);
                            setReasoningMenuRect(null);
                          }}
                          className={`block w-full px-3 py-1.5 text-left text-xs ${
                            composerReasoning === e ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:bg-surface-raised"
                          }`}
                        >
                          {REASONING_LABELS[e]}
                          {e === "high" ? " (default)" : ""}
                        </button>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <div className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                        Fast Mode
                      </div>
                      {(["off", "on"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            setComposerFastMode(v === "on");
                            setReasoningMenuOpen(false);
                            setReasoningMenuRect(null);
                          }}
                          className={`block w-full px-3 py-1.5 text-left text-xs ${
                            composerFastMode === (v === "on") ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:bg-surface-raised"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
              </div>
            </>
          )}

          {activeProvider === "ollama" && (
            <>
              <span className="h-4 w-px shrink-0 bg-border" />
              <div className="relative shrink-0" ref={ollamaMenuRef}>
                <button
                  ref={ollamaTriggerRef}
                  type="button"
                  onClick={() => {
                    const opening = !ollamaMenuOpen;
                    closeAllMenus();
                    if (opening) {
                      setOllamaMenuOpen(true);
                      setOllamaMenuRect(ollamaTriggerRef.current?.getBoundingClientRect() ?? null);
                      setOllamaSearch("");
                    }
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  <span className="max-w-[120px] truncate">{ollamaModel}</span>
                  <ChevronUp className="h-3 w-3 opacity-70" />
                </button>
                {ollamaMenuOpen &&
                  ollamaMenuRect &&
                  createPortal(
                    <div
                      ref={ollamaDropdownRef}
                      className="fixed z-[9999] min-w-[180px] max-w-[260px] rounded-lg border border-border bg-surface py-1 shadow-xl"
                      style={{
                        top: ollamaMenuRect.top - 4,
                        left: ollamaMenuRect.left,
                        transform: "translateY(-100%)",
                        backgroundColor: "var(--color-surface, #171717)",
                        color: "var(--color-foreground, #fafafa)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px var(--color-border, rgba(255,255,255,0.1))",
                      }}
                    >
                      <div className="px-2 pb-1 pt-1.5">
                        <input
                          autoFocus
                          value={ollamaSearch}
                          onChange={(e) => setOllamaSearch(e.target.value)}
                          placeholder="Find model…"
                          className="w-full rounded bg-input px-2 py-1 text-xs text-foreground placeholder-muted-foreground outline-none"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {ollamaModels
                          .filter((m) => m.name.toLowerCase().includes(ollamaSearch.toLowerCase()))
                          .map((m) => (
                            <button
                              key={m.name}
                              type="button"
                              onClick={() => {
                                handleOllamaModelChange(m.name);
                                setOllamaMenuOpen(false);
                                setOllamaMenuRect(null);
                              }}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs ${
                                ollamaModel === m.name ? "bg-surface-raised text-foreground" : "text-muted-foreground hover:bg-surface-raised"
                              }`}
                            >
                              <span className="truncate">{m.name}</span>
                              {m.parameter_size && (
                                <span className="shrink-0 text-[10px] text-muted-foreground">{m.parameter_size}</span>
                              )}
                            </button>
                          ))}
                        {ollamaModels.length === 0 && (
                          <div className="px-3 py-2 text-[11px] text-muted-foreground">
                            No models found. Is Ollama running?
                          </div>
                        )}
                      </div>
                    </div>,
                    document.body
                  )}
              </div>
            </>
          )}

          <span className="h-4 w-px shrink-0 bg-border" />
          <button
            type="button"
            onClick={() => setInteractionMode((m) => (m === "plan" ? "default" : "plan"))}
            title={
              interactionMode === "plan"
                ? "Plan mode — click to return to normal chat mode"
                : "Default mode — click to enter plan mode"
            }
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <MessageCircle className="h-3 w-3" />
            {interactionMode === "plan" ? "Plan" : "Chat"}
          </button>
          <span className="h-4 w-px shrink-0 bg-border" />
          <button
            type="button"
            onClick={() =>
              setRuntimeMode((m) => (m === "full-access" ? "approval-required" : "full-access"))
            }
            title={
              runtimeMode === "full-access"
                ? "Full access — click to require approvals"
                : "Approval required — click for full access"
            }
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            {runtimeMode === "full-access" ? (
              <LockOpen className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            {runtimeMode === "full-access" ? "Full access" : "Supervised"}
          </button>
        </div>

        {isLoading ? (
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-foreground transition-colors hover:bg-surface"
            aria-label="Cancel"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex shrink-0 items-center gap-1 rounded-full bg-[#55aaff] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#66bbff] disabled:opacity-30"
          >
            Let's go
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  // Welcome screen (no thread or empty thread)
  if (!threadId || messages.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-background p-4">
        <div className="w-full max-w-md">
          <h1 className="mb-1 text-2xl font-medium tracking-tight text-foreground">
            What can I do for you?
          </h1>
          <p className="mb-5 text-sm text-muted-foreground">Caret is your AI-powered operating layer.</p>
          <form onSubmit={handleSubmit}>{inputBox}</form>
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                />
              </svg>
              Pick a task, any task
            </div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  setInput(s.label);
                  inputRef.current?.focus();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-raised"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-input text-muted-foreground">
                  {s.icon}
                </div>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} showActionsInChat={showActionsInChat} />
          ))}
          {isLoading && !messages.some((m) => m.isStreaming) && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-muted-foreground">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-3 pt-2">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          {queue.length > 0 ? (
            <div className="mb-2 space-y-1.5">
              {queue.map((text, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{text}</span>
                  <button
                    type="button"
                    onClick={() => steerQueuedMessage(i)}
                    className="shrink-0 rounded bg-surface-raised px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                  >
                    Steer
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {inputBox}
        </form>
      </div>
    </div>
  );
}
