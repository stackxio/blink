import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { useOutletContext, useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import MessageBubble from "@/components/MessageBubble";
import type { Message } from "@/components/MessageBubble";

interface ChatContext {
  onLoadingChange: (loading: boolean) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onNewThread: (folderId?: string | null) => Promise<void>;
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

const SUGGESTIONS = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    label: "Optimize my week",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
    label: "Organize my files",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    label: "Find insights in files",
  },
];

export default function ChatArea() {
  const { onLoadingChange, onRenameThread, onNewThread } = useOutletContext<ChatContext>();
  const { threadId } = useParams();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Store pending prompt to send after thread creation navigates us
  const pendingPromptRef = useRef<string | null>(null);
  // Track active stream session for cancellation
  const sessionIdRef = useRef<string | null>(null);

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

    // Skip loading if we have a pending prompt — sendMessage will handle state
    if (pendingPromptRef.current) return;

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

  // When threadId appears and we have a pending prompt, send it
  useEffect(() => {
    if (threadId && pendingPromptRef.current) {
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      sendMessage(prompt, threadId);
    }
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

    const unlistenDone = await listen<{ full_text: string }>(
      "chat:done",
      async (event) => {
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
      },
    );

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
      },
    );

    function cleanup() {
      unlistenChunk();
      unlistenDone();
      unlistenError();
      unlistenCancelled();
    }

    try {
      const sid = await invoke<string>("chat_stream", { input: { prompt: text, threadId: tid } });
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");

    if (threadId) {
      // We have a thread — send directly
      await sendMessage(text, threadId);
    } else {
      // No thread yet — create one, store pending prompt, navigation will trigger send
      pendingPromptRef.current = text;
      await onNewThread(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const inputBox = (
    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900/80 focus-within:border-neutral-600">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="How can I help you today?"
        rows={1}
        className="block w-full resize-none bg-transparent px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 outline-none"
      />
      <div className="flex items-center justify-between px-3 pb-2">
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            Codex
          </span>
        </div>
        {isLoading ? (
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 transition-colors hover:bg-white"
          >
            <svg className="h-3 w-3 text-neutral-900" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex items-center gap-1 rounded-full bg-[#55aaff] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#66bbff] disabled:opacity-30"
          >
            Let's go
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  // Welcome screen (no thread or empty thread)
  if (!threadId || messages.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4">
        <div className="w-full max-w-md">
          <h1 className="mb-1 text-2xl font-medium tracking-tight text-neutral-100">
            What can I do for you?
          </h1>
          <p className="mb-5 text-sm text-neutral-500">
            Caret is your AI-powered operating layer.
          </p>
          <form onSubmit={handleSubmit}>{inputBox}</form>
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
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
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-neutral-300 transition-colors hover:bg-surface-raised"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700/60 bg-neutral-800/50 text-neutral-500">
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
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isLoading && !messages.some((m) => m.isStreaming) && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-600 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-600 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-600 [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-neutral-600">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 pb-3 pt-2">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          {inputBox}
        </form>
      </div>
    </div>
  );
}
