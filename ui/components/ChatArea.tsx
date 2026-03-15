import React, { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { useOutletContext, useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronUp, ChevronDown, MessageCircle, Lock, LockOpen, Paperclip, FolderOpen, FileText, Search, Sparkles, Plus, ArrowUp, Square, Zap } from "lucide-react";
import MessageBubble from "@/components/MessageBubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Message, Activity } from "@/components/MessageBubble";

interface ChatThread {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: Date;
  messageCount: number;
}

interface ChatContext {
  onLoadingChange: (loading: boolean) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onNewThread: (projectId?: string | null) => void;
  createThread: (projectId?: string | null) => Promise<{ id: string; title: string }>;
  pendingProjectIdRef: React.MutableRefObject<string | null>;
  activeThreadId: string | null;
  threads: ChatThread[];
  setHeaderExtra: (node: React.ReactNode) => void;
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
  { icon: FolderOpen, label: "Organize my downloads folder" },
  { icon: FileText, label: "Summarize documents in a folder" },
  { icon: Search, label: "Find insights in my files" },
];

export default function ChatArea() {
  const { onLoadingChange, onRenameThread, createThread, pendingProjectIdRef, threads, setHeaderExtra } =
    useOutletContext<ChatContext>();
  const { threadId } = useParams();
  const currentThread = threads?.find((t) => t.id === threadId);
  const projectId = currentThread?.projectId ?? null;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [followUpBehavior, setFollowUpBehavior] = useState<"queue" | "steer">("queue");
  const [showActionsInChat, setShowActionsInChat] = useState(true);
  const [activeProvider, setActiveProvider] = useState<string>("codex");
  const [composerReasoning, setComposerReasoning] = useState<ReasoningEffort>("high");
  const [composerFastMode, setComposerFastMode] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"default" | "plan">("default");
  const [runtimeMode, setRuntimeMode] = useState<"full-access" | "approval-required">("full-access");
  const [ollamaModels, setOllamaModels] = useState<{ name: string; size: number; parameter_size: string }[]>([]);
  const [ollamaModel, setOllamaModel] = useState<string>("llama3");
  const [ollamaSearch, setOllamaSearch] = useState("");
  const [gptModel, setGptModel] = useState("gpt-5.4");
  const [claudeModel, setClaudeModel] = useState("sonnet");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Track active stream session for cancellation
  const sessionIdRef = useRef<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [effectiveScope, setEffectiveScope] = useState<{ mode: string; root_path: string | null; display_label: string } | null>(null);

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
        .then((models) => {
          setOllamaModels(models);
          if (models.length > 0) {
            setOllamaModel((prev) => {
              const exists = models.some((m) => m.name === prev);
              return exists ? prev : models[0].name;
            });
          }
        })
        .catch(() => setOllamaModels([]));
    }
  }, [activeProvider]);


  // Scroll so there’s no empty “forehead”: top when content fits, bottom when it overflows
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const { scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) el.scrollTop = 0;
      else el.scrollTop = scrollHeight - clientHeight;
    });
  }, [messages]);

  // Load messages from db when thread changes
  useEffect(() => {
    inputRef.current?.focus();

    if (!threadId) {
      queueMicrotask(() => setMessages([]));
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

  // Load effective scope and push "Target: ..." into layout header (single row, no forehead)
  useEffect(() => {
    if (!threadId) {
      setEffectiveScope(null);
      setHeaderExtra(null);
      return;
    }
    let cancelled = false;
    invoke<{ mode: string; root_path: string | null; display_label: string }>("resolve_effective_scope", {
      threadId,
    })
      .then((scope) => {
        if (!cancelled) {
          setEffectiveScope(scope);
          setHeaderExtra(<>Target: {scope.display_label}</>);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEffectiveScope(null);
          setHeaderExtra(null);
        }
      });
    return () => {
      cancelled = true;
      setHeaderExtra(null);
    };
  }, [threadId, setHeaderExtra]);

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
      try {
        await invoke("append_thread_summary", {
          threadId: tid,
          userContent: text,
          assistantContent: full_text,
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
          runtimeMode: runtimeMode,
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
    try {
      const s = await invoke<Record<string, unknown>>("get_settings");
      await invoke("save_settings", { settings: { ...s, active_provider: provider } });
    } catch {
      // Non-critical
    }
  }

  function clearInput() {
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  async function handleSubmit(e: FormEvent, opts?: { forceSteer?: boolean; forceQueue?: boolean }) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    if (isLoading && threadId) {
      if (opts?.forceQueue) {
        setQueue((prev) => [...prev, text]);
        clearInput();
        return;
      }
      if (opts?.forceSteer || followUpBehavior === "steer") {
        clearInput();
        await handleCancel();
        await sendMessage(text, threadId);
      } else {
        setQueue((prev) => [...prev, text]);
        clearInput();
      }
      return;
    }

    clearInput();

    if (threadId) {
      await sendMessage(text, threadId);
    } else {
      try {
        const projectId = pendingProjectIdRef.current;
        pendingProjectIdRef.current = null;
        const thread = await createThread(projectId);
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
        onChange={(e) => {
          setInput(e.target.value);
          const el = e.target;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
        }}
        onKeyDown={handleKeyDown}
        placeholder={isLoading ? "Ask for follow-up changes" : "How can I help you today?"}
        rows={1}
        className="block w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none"
        style={{ overflowY: "auto", maxHeight: "200px" }}
      />
      <div className="flex items-center gap-2 px-3 pb-3 pt-1">
        {/* + button — attach / plan / runtime */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <Plus size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  const paths = await invoke<string[]>("pick_files");
                  if (paths.length === 0) return;
                  await invoke("attach_files", {
                    projectId: projectId ?? undefined,
                    threadId: threadId ?? undefined,
                    paths,
                  });
                  const list = await invoke<{ id: string }[]>("list_attachments", {
                    projectId: projectId ?? undefined,
                    threadId: threadId ?? undefined,
                  });
                  for (const a of list.slice(-paths.length)) {
                    invoke("extract_attachment_text", { attachmentId: a.id }).catch(() => {});
                  }
                } catch {
                  // ignore
                }
              }}
            >
              <Paperclip size={14} />
              Add photos &amp; files
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setInteractionMode((m) => (m === "plan" ? "default" : "plan"))}>
              <MessageCircle size={14} />
              <span className="flex-1">Plan mode</span>
              {/* toggle pill */}
              <span className={`ml-auto flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${interactionMode === "plan" ? "bg-accent justify-end" : "bg-muted"}`}>
                <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
              </span>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Zap size={14} />
                Speed
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[140px]">
                <DropdownMenuRadioGroup value={composerFastMode ? "fast" : "standard"} onValueChange={(v) => setComposerFastMode(v === "fast")}>
                  <DropdownMenuRadioItem value="standard">Standard</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="fast">Fast</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Model selectors */}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground">
                <span>{{ codex: "GPT", claude_code: "Claude", ollama: "Ollama", custom: "Custom" }[activeProvider] ?? activeProvider}</span>
                <ChevronDown size={11} className="opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[120px]">
              {(["codex", "claude_code", "ollama", "custom"] as const).map((p) => {
                const label: Record<string, string> = { codex: "GPT", claude_code: "Claude", ollama: "Ollama", custom: "Custom" };
                return (
                  <DropdownMenuItem key={p} onClick={() => handleProviderChange(p)}>
                    {label[p] ?? p}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {(activeProvider === "codex" || activeProvider === "claude_code") && (() => {
            const models = activeProvider === "codex" ? GPT_MODELS : CLAUDE_MODELS;
            const currentModel = activeProvider === "codex" ? gptModel : claudeModel;
            const currentLabel = models.find((m) => m.slug === currentModel)?.label ?? currentModel;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground">
                    <span className="max-w-[120px] truncate">{currentLabel}</span>
                    <ChevronDown size={11} className="opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px]">
                  {models.map((m) => (
                    <DropdownMenuItem key={m.slug} onClick={() => handleModelChange(activeProvider, m.slug)}>
                      {m.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}

          {activeProvider === "codex" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground">
                  <span>{REASONING_LABELS[composerReasoning]}{composerFastMode ? " · Fast" : ""}</span>
                  <ChevronDown size={11} className="opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[140px]">
                <DropdownMenuLabel className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">Reasoning</DropdownMenuLabel>
                {(["xhigh", "high", "medium", "low"] as const).map((e) => (
                  <DropdownMenuItem key={e} onClick={() => setComposerReasoning(e)}>
                    {REASONING_LABELS[e]}{e === "high" ? " (default)" : ""}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">Fast Mode</DropdownMenuLabel>
                {(["off", "on"] as const).map((v) => (
                  <DropdownMenuItem key={v} onClick={() => setComposerFastMode(v === "on")}>{v}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {activeProvider === "ollama" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground">
                  <span className="max-w-[120px] truncate">{ollamaModel}</span>
                  <ChevronDown size={11} className="opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px] max-w-[260px]" onCloseAutoFocus={() => setOllamaSearch("")}>
                <div className="px-2 pb-1 pt-1.5" onClick={(e) => e.stopPropagation()}>
                  <Input autoFocus value={ollamaSearch} onChange={(e) => setOllamaSearch(e.target.value)} placeholder="Find model…" className="h-7 px-2 py-1 text-xs" />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {ollamaModels.filter((m) => m.name.toLowerCase().includes(ollamaSearch.toLowerCase())).map((m) => (
                    <DropdownMenuItem key={m.name} onClick={() => handleOllamaModelChange(m.name)}>
                      <span className="truncate">{m.name}</span>
                      {m.parameter_size && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{m.parameter_size}</span>}
                    </DropdownMenuItem>
                  ))}
                  {ollamaModels.length === 0 && <div className="px-3 py-2 text-[11px] text-muted-foreground">No models found. Is Ollama running?</div>}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Submit / cancel */}
        {isLoading ? (
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80"
            aria-label="Cancel"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80 disabled:opacity-20"
            aria-label="Send"
          >
            <ArrowUp size={15} />
          </button>
        )}
      </div>
    </div>
  );

  // Welcome screen (no thread or empty thread)
  if (!threadId || messages.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-background">
        {/* Hero */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-background">
            <Sparkles size={24} className="text-accent" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Let's get started
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Caret — your AI operating layer
          </p>
        </div>

        {/* Suggestion cards + input */}
        <div className="w-full max-w-2xl px-6">
          <div className="mb-4 grid grid-cols-3 gap-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => { setInput(s.label); inputRef.current?.focus(); }}
                className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-raised"
              >
                <s.icon size={18} className="mb-3 text-muted-foreground" />
                <p className="text-[13px] text-foreground">{s.label}</p>
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit}>{inputBox}</form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Messages: content from top; scroll to bottom so no empty "forehead" above */}
      <div className="min-h-0 flex-1 overflow-y-auto" ref={messagesScrollRef}>
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => steerQueuedMessage(i)}
                    className="shrink-0"
                  >
                    Steer
                  </Button>
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
