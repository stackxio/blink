import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Terminal,
  Pencil,
  FileText,
  Sparkles,
  Search,
  Wrench,
  ChevronRight,
} from "lucide-react";

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

interface MessageBubbleProps {
  message: Message;
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

  // Group activities by kind for summary
  const summary = activities.length === 1
    ? activities[0].title + (activities[0].detail ? `: ${activities[0].detail}` : "")
    : `${activities.length} actions`;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-neutral-500 transition-colors hover:text-neutral-400"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="font-medium text-neutral-400">{summary}</span>
      </button>

      {expanded && (
        <div className="ml-1.5 mt-1 space-y-0.5 border-l border-neutral-800 pl-3">
          {activities.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <ActivityIcon kind={a.kind} />
              <span>{a.title}</span>
              {a.detail && (
                <span className="truncate text-neutral-600" title={a.detail}>
                  {a.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasActivities = !isUser && message.activities && message.activities.length > 0;

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
        {hasActivities && <ActivityLog activities={message.activities!} />}
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

