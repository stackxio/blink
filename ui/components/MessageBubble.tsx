export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  durationMs?: number;
}

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5">
        <span
          className={`text-[11px] font-medium ${isUser ? "text-neutral-500" : "text-neutral-400"}`}
        >
          {isUser ? "You" : "Caret"}
        </span>
        <span className="text-[10px] text-neutral-600">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div
        className={`rounded-md px-3 py-2 text-[13px] leading-relaxed ${
          isUser ? "bg-neutral-800/50 text-neutral-200" : "bg-neutral-900/50 text-neutral-300"
        }`}
      >
        {message.content.split("\n").map((line, i) => (
          <p key={i} className={line === "" ? "h-2" : ""}>
            {line}
          </p>
        ))}
      </div>

      {!isUser && message.durationMs != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-neutral-800/60" />
          <span className="text-[10px] text-neutral-600">
            {message.durationMs < 1000
              ? `${message.durationMs}ms`
              : `${(message.durationMs / 1000).toFixed(1)}s`}
          </span>
          <div className="h-px flex-1 bg-neutral-800/60" />
        </div>
      )}
    </div>
  );
}
