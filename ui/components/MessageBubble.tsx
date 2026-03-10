import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
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
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="prose-caret">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
        )}
        {message.isStreaming && (
          <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-neutral-400" />
        )}
      </div>
    </div>
  );
}

