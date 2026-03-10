import { useState, useRef, useEffect, type FormEvent } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ActivityEntry {
  id: string;
  text: string;
  timestamp: Date;
}

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([
    {
      id: "init",
      text: "Caret started",
      timestamp: new Date(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setActivity((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: `Processed: "${text.length > 40 ? text.slice(0, 40) + "..." : text}"`,
        timestamp: new Date(),
      },
    ]);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center border-b border-neutral-800 px-4">
        <h1 className="text-sm font-semibold tracking-wide text-neutral-300">Caret</h1>
      </header>

      {/* Main content */}
      <main className="flex min-h-0 flex-1 flex-col">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-neutral-500">Send a message to get started.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      msg.role === "user"
                        ? "max-w-md rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                        : "max-w-md rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-200"
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Command input */}
        <div className="shrink-0 border-t border-neutral-800 p-4">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Caret to do something..."
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
            >
              Send
            </button>
          </form>
        </div>
      </main>

      {/* Activity log */}
      <footer className="shrink-0 border-t border-neutral-800">
        <div className="flex items-center gap-2 px-4 py-1.5">
          <span className="text-xs font-medium text-neutral-500">Activity</span>
        </div>
        <div className="max-h-24 overflow-y-auto px-4 pb-2">
          {activity.map((entry) => (
            <div key={entry.id} className="flex items-baseline gap-2 text-xs text-neutral-500">
              <span className="shrink-0 tabular-nums text-neutral-600">
                {entry.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
