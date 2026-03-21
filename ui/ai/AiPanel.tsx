import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, ArrowUp, Square, Sparkles, FileCode } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppStore } from "@/store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

interface Props {
  onClose: () => void;
}

export default function AiPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  const ws = useAppStore((s) => s.activeWorkspace());
  const activeFile = ws && ws.activeFileIdx >= 0 ? ws.openFiles[ws.activeFileIdx] : null;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", isStreaming: true }]);

    const unlistenChunk = await listen<{ chunk: string }>("chat:stream", (event) => {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: m.content + event.payload.chunk } : m),
      );
    });

    const unlistenDone = await listen<{ full_text: string }>("chat:done", (event) => {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: event.payload.full_text, isStreaming: false } : m),
      );
      setIsLoading(false);
      sessionIdRef.current = null;
      cleanup();
    });

    const unlistenError = await listen<{ error: string }>("chat:error", (event) => {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${event.payload.error}`, isStreaming: false } : m),
      );
      setIsLoading(false);
      sessionIdRef.current = null;
      cleanup();
    });

    const unlistenCancelled = await listen<{ partial_text: string }>("chat:cancelled", (event) => {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: event.payload.partial_text || "*(cancelled)*", isStreaming: false } : m),
      );
      setIsLoading(false);
      sessionIdRef.current = null;
      cleanup();
    });

    function cleanup() {
      unlistenChunk();
      unlistenDone();
      unlistenError();
      unlistenCancelled();
    }

    try {
      const sid = await invoke<string>("chat_stream", {
        input: {
          prompt: text,
          threadId: null,
          runtimeMode: "full-access",
        },
      });
      sessionIdRef.current = sid;
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${errorText}`, isStreaming: false } : m),
      );
      setIsLoading(false);
      cleanup();
    }
  }

  async function handleCancel() {
    if (!sessionIdRef.current) return;
    try {
      await invoke("cancel_stream", { sessionId: sessionIdRef.current });
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel__header">
        <span className="ai-panel__title">AI Assistant</span>
        <button type="button" className="ai-panel__close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Context bar — shows active file */}
      {activeFile && (
        <div className="ai-panel__context-bar">
          <FileCode />
          <span>{activeFile.name}</span>
        </div>
      )}

      {/* Messages */}
      <div className="ai-panel__messages">
        {messages.length === 0 ? (
          <div className="ai-panel__empty">
            <Sparkles size={32} style={{ opacity: 0.3 }} />
            <p>Ask anything about your code or project.</p>
            <p style={{ fontSize: 11, opacity: 0.6 }}>The AI can see your active file and workspace context.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
              <div className="chat-msg__label">{msg.role === "user" ? "You" : "Assistant"}</div>
              <div className="chat-msg__content">
                {msg.role === "assistant" ? (
                  <>
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                    {msg.isStreaming && <span className="chat-msg__streaming" />}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-panel__input-area">
        <div className="ai-panel__input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "Waiting for response…" : "Ask about your code…"}
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
      </div>
    </div>
  );
}
