import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Terminal, Pencil, FileText, Sparkles, Search, Wrench, ChevronRight } from "lucide-react";

export interface Activity {
  kind: string;
  title: string;
  detail?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  activities?: Activity[];
}

export interface MessageBubbleProps {
  message: Message;
  /** When false, actions (explored, ran command, etc.) are hidden. Default true. */
  showActionsInChat?: boolean;
}

function sanitizeAssistantContent(content: string): string {
  return content
    .replace(/cite[^]+/g, "")
    .replace(/\w+[^]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ACTIVITY_ICON_MAP: Record<string, typeof Terminal> = {
  command: Terminal,
  file_change: Pencil,
  file_read: FileText,
  reasoning: Sparkles,
  web_search: Search,
  tool_call: Wrench,
};

function ActivityIcon({ kind }: { kind: string }) {
  const Icon = ACTIVITY_ICON_MAP[kind] || Wrench;
  return <Icon size={12} />;
}

function ActivityLog({ activities }: { activities: Activity[] }) {
  const [expanded, setExpanded] = useState(false);

  if (activities.length === 0) return null;

  const single = activities.length === 1;
  const summaryLabel = single ? activities[0].title : `${activities.length} actions`;
  const summaryDetail = single ? activities[0].detail : null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight size={12} className={`mt-0.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="shrink-0 font-medium whitespace-nowrap text-muted-foreground">{summaryLabel}</span>
          {summaryDetail != null && summaryDetail !== "" && (
            <div className="mt-0.5 break-words font-mono text-muted-foreground" title={summaryDetail}>
              {summaryDetail}
            </div>
          )}
        </span>
      </button>

      {expanded && (
        <div className="ml-1.5 mt-1 space-y-1.5 border-l border-border pl-3">
          {activities.map((a, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <ActivityIcon kind={a.kind} />
                <span className="shrink-0 whitespace-nowrap text-[11px] text-foreground">{a.title}</span>
              </div>
              {a.detail && (
                <div className="break-words font-mono text-[11px] text-muted-foreground" title={a.detail}>
                  {a.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message, showActionsInChat = true }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasActivities = showActionsInChat && !isUser && message.activities && message.activities.length > 0;
  const renderedContent = isUser ? message.content : sanitizeAssistantContent(message.content);

  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5">
        <span
          className={`text-[11px] font-medium ${isUser ? "text-muted-foreground" : "text-muted-foreground"}`}
        >
          {isUser ? "You" : "Caret"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div
        className={`rounded-md border px-3 py-2 text-[13px] leading-relaxed ${
          isUser ? "border-border bg-surface-raised text-foreground" : "border-border bg-surface text-foreground"
        }`}
      >
        {hasActivities && <ActivityLog activities={message.activities!} />}
        {isUser ? (
          <p>{renderedContent}</p>
        ) : (
          <div className="prose-caret">
            <Markdown remarkPlugins={[remarkGfm]}>{renderedContent}</Markdown>
          </div>
        )}
        {message.isStreaming && (
          <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-muted" />
        )}
      </div>
    </div>
  );
}
