import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Terminal, Pencil, FileText, Sparkles, Search, Wrench, ChevronRight, Lightbulb, CheckCircle, Loader } from "lucide-react";

export interface Activity {
  kind: string;
  title: string;
  detail?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  activities?: Activity[];
  toolCalls?: ToolCall[];
}

function parseThinking(raw: string): { thinking: string | null; text: string; isOpen: boolean } {
  if (!raw.startsWith("<think>")) return { thinking: null, text: raw, isOpen: false };
  const closeIdx = raw.indexOf("</think>");
  if (closeIdx === -1) return { thinking: raw.slice(7), text: "", isOpen: true };
  return { thinking: raw.slice(7, closeIdx).trim(), text: raw.slice(closeIdx + 8).trim(), isOpen: false };
}

function sanitize(content: string): string {
  return content.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const ACTIVITY_ICONS: Record<string, typeof Terminal> = {
  command: Terminal, file_change: Pencil, file_read: FileText,
  reasoning: Sparkles, web_search: Search, tool_call: Wrench,
};

const TOOL_ICONS: Record<string, typeof Terminal> = {
  read_file: FileText,
  write_file: Pencil,
  list_dir: FileText,
  run_command: Terminal,
  search_files: Search,
};

function ToolCallCard({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[call.name] ?? Wrench;
  const label = call.name.replace(/_/g, " ");

  return (
    <div className="chat-msg__tool-call">
      <button
        type="button"
        className="chat-msg__tool-call-header"
        onClick={() => setExpanded((v) => !v)}
      >
        {call.status === "running" ? (
          <Loader size={12} className="chat-msg__tool-call-spinner" />
        ) : (
          <CheckCircle size={12} className="chat-msg__tool-call-check" />
        )}
        <Icon size={12} />
        <span className="chat-msg__tool-call-name">{label}</span>
        {call.args && Object.keys(call.args).length > 0 && (
          <span className="chat-msg__tool-call-arg">
            {String(Object.values(call.args)[0]).split("/").pop()?.slice(0, 30)}
          </span>
        )}
        <ChevronRight size={11} className={expanded ? "chat-msg__chevron--open" : ""} />
      </button>
      {expanded && (
        <div className="chat-msg__tool-call-body">
          <pre className="chat-msg__tool-call-pre">{JSON.stringify(call.args, null, 2)}</pre>
          {call.result && (
            <>
              <div className="chat-msg__tool-call-result-label">Result</div>
              <pre className="chat-msg__tool-call-pre">{call.result.slice(0, 500)}{call.result.length > 500 ? "…" : ""}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityLog({ activities }: { activities: Activity[] }) {
  const [expanded, setExpanded] = useState(false);
  if (activities.length === 0) return null;
  const label = activities.length === 1 ? activities[0].title : `${activities.length} actions`;

  return (
    <div className="chat-msg__activities">
      <button type="button" className="chat-msg__activity-toggle" onClick={() => setExpanded(!expanded)}>
        <ChevronRight size={12} className={expanded ? "chat-msg__chevron--open" : ""} />
        <span>{label}</span>
      </button>
      {expanded && (
        <div className="chat-msg__activity-list">
          {activities.map((a, i) => {
            const Icon = ACTIVITY_ICONS[a.kind] || Wrench;
            return (
              <div key={i} className="chat-msg__activity-item">
                <Icon size={12} />
                <span>{a.title}</span>
                {a.detail && <div className="chat-msg__activity-detail">{a.detail}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ content, isOpen, isStreaming }: { content: string; isOpen: boolean; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="chat-msg__thinking">
      <button type="button" className="chat-msg__thinking-toggle" onClick={() => setExpanded((v) => !v)}>
        <Lightbulb size={13} />
        <span>{isOpen && isStreaming ? "Thinking..." : "Thought process"}</span>
        {!isOpen && <ChevronRight size={12} className={expanded ? "chat-msg__chevron--open" : ""} />}
      </button>
      {(expanded || isOpen) && content && (
        <div className="chat-msg__thinking-content">
          {content}
          {isOpen && isStreaming && <span className="chat-msg__streaming" />}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const hasActivities = !isUser && message.activities && message.activities.length > 0;
  const hasToolCalls = !isUser && message.toolCalls && message.toolCalls.length > 0;
  const { thinking, text: parsedText, isOpen } = isUser
    ? { thinking: null, text: message.content, isOpen: false }
    : parseThinking(message.content);
  const content = isUser ? parsedText : sanitize(parsedText);

  return (
    <div className={`chat-msg chat-msg--${message.role}`}>
      <div className="chat-msg__content">
        {hasActivities && <ActivityLog activities={message.activities!} />}
        {hasToolCalls && (
          <div className="chat-msg__tool-calls">
            {message.toolCalls!.map((tc, i) => (
              <ToolCallCard key={`${tc.name}-${i}`} call={tc} />
            ))}
          </div>
        )}
        {thinking != null && <ThinkingBlock content={thinking} isOpen={isOpen} isStreaming={message.isStreaming} />}
        {isUser ? (
          <p>{content}</p>
        ) : (
          <>
            {content && <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>}
            {message.isStreaming && !isOpen && <span className="chat-msg__streaming" />}
          </>
        )}
      </div>
    </div>
  );
}
