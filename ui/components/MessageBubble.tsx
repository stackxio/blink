import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const ACTIVITY_ICONS: Record<string, string> = {
  command: "terminal",
  file_change: "pencil",
  file_read: "file",
  reasoning: "brain",
  web_search: "search",
  tool_call: "wrench",
};

function ActivityIcon({ kind }: { kind: string }) {
  const icon = ACTIVITY_ICONS[kind] || "wrench";
  switch (icon) {
    case "terminal":
      return (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3" />
        </svg>
      );
    case "pencil":
      return (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
        </svg>
      );
    case "file":
      return (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
    case "brain":
      return (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
      );
    case "search":
      return (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      );
    default:
      return (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.193-.14 1.743" />
        </svg>
      );
  }
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
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
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

