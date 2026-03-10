import { useState, useRef, useEffect, type FormEvent } from "react";
import { useOutletContext, useParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import MessageBubble from "@/components/MessageBubble";
import type { Message } from "@/components/MessageBubble";

interface ChatContext {
  onLoadingChange: (loading: boolean) => void;
  onRenameThread: (threadId: string, title: string) => void;
  activeThreadId: string | null;
}

export default function ChatArea() {
  const { onLoadingChange, onRenameThread } = useOutletContext<ChatContext>();
  const { threadId } = useParams();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  function updateLoading(value: boolean) {
    setIsLoading(value);
    onLoadingChange(value);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    if (messages.length === 0 && threadId) {
      const title = text.length > 40 ? text.slice(0, 40) + "..." : text;
      onRenameThread(threadId, title);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    updateLoading(true);

    const startTime = Date.now();

    try {
      const response = await invoke<{ text: string }>("chat", {
        input: { prompt: text, system: null },
      });

      const durationMs = Date.now() - startTime;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.text,
          timestamp: new Date(),
          durationMs,
        },
      ]);
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorText = err instanceof Error ? err.message : String(err);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${errorText}`,
          timestamp: new Date(),
          durationMs,
        },
      ]);
    } finally {
      updateLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  if (!threadId) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
        <p className="text-sm text-neutral-500">No chat selected</p>
        <p className="text-xs text-neutral-600">Create a new chat or select one from the sidebar</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
            <p className="text-sm text-neutral-500">Ask Caret to do something</p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
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
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-neutral-800 px-4 pb-3 pt-2">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 focus-within:border-neutral-600">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Caret to do something..."
              rows={1}
              className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none"
            />
            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                  Codex
                </span>
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex h-6 w-6 items-center justify-center rounded bg-neutral-100 text-neutral-900 transition-colors hover:bg-white disabled:opacity-30"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
