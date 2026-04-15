import { useState, useRef, useEffect, useMemo, memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Square,
  SquarePen,
  Wrench,
  ChevronRight,
  AlertCircle,
  Settings2,
  Check,
  X,
  Zap,
  Map as MapIcon,
  Bug,
  MessageCircle,
  Brain,
  Plus,
  FileText,
  Folder,
  Download,
  RefreshCw,
} from "lucide-react";
import CliAgentPanel from "./CliAgentPanel";
import { AgentLogo } from "./agent-logos";
import {
  ALL_AGENTS,
  loadAgentSettings,
  saveAgentSettings,
  type AgentSettings,
} from "./agent-settings";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store";
import { buildSystemPrompt } from "@@/panel/system-prompt";
import { loadMemory } from "@@/panel/memory";
import { loadBlinkCodeConfig, saveBlinkCodeConfig, type BlinkCodeConfig } from "@@/panel/config";
import {
  getSlashSuggestions,
  parseSlashCommand,
  getPromptCommand,
  SLASH_COMMANDS,
} from "@@/panel/slash-commands";
import {
  getPartialCompactPrompt,
  getCompactUserSummaryMessage,
} from "@@/panel/compact";
import type { BridgeOutEvent, HistoryDisplayMessage, ThreadMeta } from "@contracts/bridge-protocol";

// ── Message types ─────────────────────────────────────────────────────────────

interface ToolCallEntry {
  id: string;
  name: string;
  result?: string;
  is_error?: boolean;
  expanded: boolean;
}

type PanelMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      thinkingContent?: string;
      toolCalls: ToolCallEntry[];
      streaming?: boolean;
    }
  | { id: string; role: "system"; content: string };

// ── Context items ─────────────────────────────────────────────────────────────

interface ContextItem {
  id: string;
  path: string;
  name: string;
  content: string;
  isFolder?: boolean;
}

// ── Permission dialog ─────────────────────────────────────────────────────────

interface PermReq {
  reqId: string;
  toolName: string;
  input: Record<string, unknown>;
}

// ── Mode ──────────────────────────────────────────────────────────────────────

type ChatMode = "agent" | "plan" | "debug" | "ask";

const MODES: { value: ChatMode; label: string; icon: React.FC<{ size?: number }> }[] = [
  { value: "agent", label: "Agent", icon: Zap },
  { value: "plan", label: "Plan", icon: MapIcon },
  { value: "debug", label: "Debug", icon: Bug },
  { value: "ask", label: "Ask", icon: MessageCircle },
];

const MODE_PREFIXES: Record<ChatMode, string> = {
  agent: "",
  plan: "[Mode: Plan — analyze the codebase and create a detailed plan only. Do NOT write, edit, or execute anything.]\n\n",
  debug:
    "[Mode: Debug — diagnose and explain the issue only. Do NOT write, edit, or execute anything.]\n\n",
  ask: "[Mode: Ask — answer questions only. Do NOT write, edit, or execute anything.]\n\n",
};

// ── Relative time helper ─────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Context window sizes (tokens) for known models ───────────────────────────

const CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-opus-4-5": 200_000,
  "claude-sonnet-4-5": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  o3: 200_000,
  "o4-mini": 200_000,
  "codex-mini-latest": 200_000,
};

// ── Provider preset options ───────────────────────────────────────────────────

const PRESETS = [
  { label: "Agent", value: "agent" },
  { label: "Custom…", value: "custom" },
];

function presetToConfig(preset: string): BlinkCodeConfig["provider"] {
  if (preset === "agent") return { type: "agent" };
  // "custom" — default to Ollama values, user can edit
  return {
    type: "openai-compat",
    model: "",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    maxTokens: 4096,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

function BlinkCodePanel() {
  const workspacePath = useAppStore((s) => s.activeWorkspace()?.path ?? null);
  const workspaceName = useAppStore((s) => s.activeWorkspace()?.name ?? null);
  const activeFile = useAppStore((s) => {
    const ws = s.activeWorkspace();
    if (!ws) return null;
    return ws.openFiles[ws.activeFileIdx] ?? null;
  });

  const [config, setConfig] = useState<BlinkCodeConfig>(loadBlinkCodeConfig);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [permReq, setPermReq] = useState<PermReq | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slashSuggestions, setSlashSuggestions] = useState<typeof SLASH_COMMANDS>([]);
  const [slashIdx, setSlashIdx] = useState(0);
  const [mode, setMode] = useState<ChatMode>("agent");
  const [contextUsage, setContextUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
  } | null>(null);

  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [atMentionQuery, setAtMentionQuery] = useState<string | null>(null);
  void atMentionQuery; // used via setAtMentionQuery; read value reserved for dropdown UI
  const [atMentionFiles, setAtMentionFiles] = useState<string[]>([]);
  const [atMentionIdx, setAtMentionIdx] = useState(0);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);

  const [autoContext, setAutoContext] = useState<boolean>(
    () => localStorage.getItem("blink-auto-context") === "true",
  );
  const [thinkingEnabled, setThinkingEnabled] = useState<boolean>(
    () => localStorage.getItem("blink-thinking") === "true",
  );
  const isCompactingRef = useRef(false);
  // Messages kept verbatim during partial compact (recent N messages)
  const compactKeptRef = useRef<PanelMessage[]>([]);

  // Image context state
  const [imageItems, setImageItems] = useState<
    Array<{ id: string; dataUrl: string; mimeType: string }>
  >([]);

  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadPickerOpen, setThreadPickerOpen] = useState(false);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const threadPickerRef = useRef<HTMLDivElement>(null);
  const threadSearchRef = useRef<HTMLInputElement>(null);

  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeInitFailed, setBridgeInitFailed] = useState(false);
  const [bridgeRetryKey, setBridgeRetryKey] = useState(0);
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(loadAgentSettings);
  const bridgeReadyRef = useRef(false);
  const pendingThinkingDeltasRef = useRef(new Map<string, string>());
  const currentAssistantMsgIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bridgeKeyRef = useRef<string | null>(null);
  const pendingTextDeltasRef = useRef(new Map<string, string>());
  const textDeltaFrameRef = useRef<number | null>(null);
  const forceScrollToBottomRef = useRef(true);

  const flushPendingTextDeltas = useCallback(() => {
    if (textDeltaFrameRef.current != null) {
      cancelAnimationFrame(textDeltaFrameRef.current);
      textDeltaFrameRef.current = null;
    }
    if (pendingTextDeltasRef.current.size === 0) return;
    const pending = new Map(pendingTextDeltasRef.current);
    pendingTextDeltasRef.current.clear();
    setMessages((prev) =>
      prev.map((message) => {
        if (message.role !== "assistant") return message;
        const delta = pending.get(message.id);
        return delta ? { ...message, content: message.content + delta } : message;
      }),
    );
  }, []);

  const queueTextDelta = useCallback(
    (assistantMsgId: string, delta: string) => {
      const next = (pendingTextDeltasRef.current.get(assistantMsgId) ?? "") + delta;
      pendingTextDeltasRef.current.set(assistantMsgId, next);
      if (textDeltaFrameRef.current != null) return;
      textDeltaFrameRef.current = requestAnimationFrame(() => {
        textDeltaFrameRef.current = null;
        flushPendingTextDeltas();
      });
    },
    [flushPendingTextDeltas],
  );

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    if (forceScrollToBottomRef.current) {
      forceScrollToBottomRef.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }
    const nearBottom = container.scrollHeight - (container.scrollTop + container.clientHeight) < 72;
    if (!nearBottom) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: streaming ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, streaming]);

  useEffect(() => {
    return () => {
      if (textDeltaFrameRef.current != null) {
        cancelAnimationFrame(textDeltaFrameRef.current);
      }
    };
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenuOpen]);

  // Close thread picker on outside click
  useEffect(() => {
    if (!threadPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (threadPickerRef.current && !threadPickerRef.current.contains(e.target as Node)) {
        setThreadPickerOpen(false);
        setRenamingThreadId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [threadPickerOpen]);

  // Listen for "Explain with AI" / "Ask AI" events from the editor
  useEffect(() => {
    function onExplain(e: Event) {
      const { code, filename } = (e as CustomEvent<{ code: string; filename: string }>).detail;
      const prompt = `Explain this code${filename ? ` from \`${filename}\`` : ""}:\n\n\`\`\`\n${code}\n\`\`\``;
      setInput(prompt);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
    function onAskAi(e: Event) {
      const { code, filename } = (e as CustomEvent<{ code: string; filename: string }>).detail;
      if (code.trim()) {
        setInput(`\`\`\`${filename ? `\n// ${filename}` : ""}\n${code}\n\`\`\`\n`);
      }
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
    document.addEventListener("blink:explain-code", onExplain);
    document.addEventListener("blink:ask-ai", onAskAi);
    return () => {
      document.removeEventListener("blink:explain-code", onExplain);
      document.removeEventListener("blink:ask-ai", onAskAi);
    };
  }, []);

  // Reset on workspace switch
  useEffect(() => {
    queueMicrotask(() => {
      pendingTextDeltasRef.current.clear();
      if (textDeltaFrameRef.current != null) {
        cancelAnimationFrame(textDeltaFrameRef.current);
        textDeltaFrameRef.current = null;
      }
      setMessages([]);
      setStreaming(false);
      setPermReq(null);
      setBridgeReady(false);
      bridgeReadyRef.current = false;
      currentAssistantMsgIdRef.current = null;
      bridgeKeyRef.current = null;
      forceScrollToBottomRef.current = true;
      setContextUsage(null);
      invoke("blink_code_bridge_stop").catch(() => {});
    });
  }, [workspacePath]);

  const bridgeKey = useMemo(
    () =>
      JSON.stringify({
        path: workspacePath,
        provider: config.provider,
        maxTurns: config.maxTurns,
        requirePermission: config.requirePermission,
      }),
    [workspacePath, config],
  );

  // Start/initialize bridge whenever bridgeKey or retryKey changes
  useEffect(() => {
    if (!workspacePath) return;

    setBridgeInitFailed(false);
    let cancelled = false;
    const run = async () => {
      // Avoid double-inits when React re-renders quickly (but always allow explicit retries).
      if (bridgeKeyRef.current === bridgeKey && bridgeRetryKey === 0) return;
      bridgeKeyRef.current = bridgeKey;

      bridgeReadyRef.current = false;
      setBridgeReady(false);
      setStreaming(false);
      setPermReq(null);
      currentAssistantMsgIdRef.current = null;
      forceScrollToBottomRef.current = true;
      // Stop any in-progress streaming messages, but keep them visible while bridge reinits
      setMessages((prev) =>
        prev.map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m)),
      );

      const activeWorkspace = useAppStore.getState().activeWorkspace();
      const activeFile =
        activeWorkspace && activeWorkspace.activeFileIdx >= 0
          ? activeWorkspace.openFiles[activeWorkspace.activeFileIdx]
          : null;

      const memory = await loadMemory(workspacePath);
      const systemPrompt = await buildSystemPrompt(
        { path: workspacePath, name: workspaceName, activeFile: activeFile?.path ?? null },
        memory,
      );

      await invoke("blink_code_bridge_start_with_init", {
        workspacePath,
        initLine: JSON.stringify({
          type: "init",
          workspacePath,
          systemPrompt,
          provider: config.provider,
          maxTurns: config.maxTurns,
          requirePermission: config.requirePermission,
        }),
      });

      // Bridge will emit `bridge_ready` once the Bun side has processed `init`.
    };

    run().catch((e) => {
      if (cancelled) return;
      setBridgeInitFailed(true);
      setMessages([
        { id: crypto.randomUUID(), role: "system", content: `Bridge init failed: ${e}` },
      ]);
    });

    return () => {
      cancelled = true;
    };
  }, [bridgeKey, workspacePath, workspaceName, bridgeRetryKey]);

  // Bridge event listener (global for the panel)
  useEffect(() => {
    let unlistenErr: (() => void) | null = null;
    (async () => {
      unlistenErr = await listen("blink-code:bridge-err", (event) => {
        const payload = event.payload as { line?: string } | null;
        const line = payload?.line?.trim();
        if (!line) return;
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "system", content: `Bridge: ${line}` },
        ]);
      });
    })();

    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await listen("blink-code:bridge", async (event) => {
        const payload = event.payload as { line?: string } | null;
        const line = payload?.line;
        if (!line) return;

        let msg: BridgeOutEvent;
        try {
          msg = JSON.parse(line) as BridgeOutEvent;
        } catch {
          return;
        }
        switch (msg.type) {
          case "bridge_ready": {
            bridgeReadyRef.current = true;
            setBridgeReady(true);
            if (msg.threads) setThreads(msg.threads);
            if (msg.activeThreadId) setActiveThreadId(msg.activeThreadId);
            if (!msg.resumed) {
              setMessages([]);
            }
            break;
          }

          case "threads_list": {
            setThreads((msg as { threads: ThreadMeta[]; activeThreadId: string }).threads);
            setActiveThreadId(
              (msg as { threads: ThreadMeta[]; activeThreadId: string }).activeThreadId,
            );
            break;
          }

          case "history": {
            const histMsgs = (msg as { messages: HistoryDisplayMessage[] }).messages;
            const panelMsgs: PanelMessage[] = histMsgs.map((m) => {
              if (m.role === "user") {
                return { id: m.id, role: "user" as const, content: m.content };
              }
              return {
                id: m.id,
                role: "assistant" as const,
                content: m.content,
                toolCalls: (m.toolCalls ?? []).map((tc) => ({ ...tc, expanded: false })),
              };
            });
            forceScrollToBottomRef.current = true;
            setMessages(panelMsgs);
            setStreaming(false);
            setContextUsage(null);
            break;
          }

          case "text_delta": {
            const { assistantMsgId, delta } = msg;
            queueTextDelta(assistantMsgId, delta);
            break;
          }

          case "thinking_delta": {
            const { assistantMsgId, delta } = msg;
            const prev = pendingThinkingDeltasRef.current.get(assistantMsgId) ?? "";
            pendingThinkingDeltasRef.current.set(assistantMsgId, prev + delta);
            setMessages((prevMsgs) =>
              prevMsgs.map((m) => {
                if (m.id !== assistantMsgId || m.role !== "assistant") return m;
                return {
                  ...m,
                  thinkingContent: (m.thinkingContent ?? "") + delta,
                };
              }),
            );
            break;
          }

          case "tool_call_start": {
            const { assistantMsgId, callId, name } = msg;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === "assistant"
                  ? { ...m, toolCalls: [...m.toolCalls, { id: callId, name, expanded: false }] }
                  : m,
              ),
            );
            break;
          }

          case "tool_call_result": {
            const { assistantMsgId, callId, result, is_error } = msg;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === "assistant"
                  ? {
                      ...m,
                      toolCalls: m.toolCalls.map((tc) =>
                        tc.id === callId ? { ...tc, result, is_error } : tc,
                      ),
                    }
                  : m,
              ),
            );
            break;
          }

          case "context_usage": {
            setContextUsage({ inputTokens: msg.inputTokens, outputTokens: msg.outputTokens });
            break;
          }

          case "turn_done": {
            flushPendingTextDeltas();
            const { assistantMsgId } = msg;
            if (currentAssistantMsgIdRef.current !== assistantMsgId) break;
            setStreaming(false);
            if (isCompactingRef.current) {
              isCompactingRef.current = false;
              const keptMessages = compactKeptRef.current;
              compactKeptRef.current = [];

              setMessages((prev) => {
                const summaryMsg = [...prev]
                  .reverse()
                  .find((m) => m.role === "assistant" && m.id === assistantMsgId);
                const rawSummary =
                  summaryMsg?.role === "assistant" ? summaryMsg.content : "(no summary)";
                // getCompactUserSummaryMessage formats the summary as a proper
                // "continued from previous session" prefix and sets
                // suppressFollowUpQuestions=true so the AI resumes working
                // immediately without asking "how can I help you?".
                const summaryText = getCompactUserSummaryMessage(rawSummary, true);
                return [
                  {
                    id: crypto.randomUUID(),
                    role: "system" as const,
                    content: summaryText,
                  },
                  ...keptMessages,
                ];
              });

              // Rebuild engine history: summary injected as a user message so the
              // AI knows about prior work, followed by the kept recent messages
              // (user/assistant text only — tool call details live in the summary).
              invoke("blink_code_bridge_send", {
                line: JSON.stringify({ type: "clear" }),
              }).catch(() => {});
              if (keptMessages.length > 0) {
                const bridgeMsgs = keptMessages
                  .filter((m) => m.role === "user" || m.role === "assistant")
                  .map((m) => ({ role: m.role, content: m.content ?? "" }));
                invoke("blink_code_bridge_send", {
                  line: JSON.stringify({ type: "set_history", messages: bridgeMsgs }),
                }).catch(() => {});
              }
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId && m.role === "assistant"
                    ? { ...m, streaming: false }
                    : m,
                ),
              );
            }
            break;
          }

          case "permission_request": {
            const { reqId, toolName, input } = msg;
            setPermReq({ reqId, toolName, input });
            break;
          }

          case "error": {
            flushPendingTextDeltas();
            const { error, assistantMsgId } = msg;
            if (assistantMsgId && currentAssistantMsgIdRef.current === assistantMsgId) {
              setStreaming(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId && m.role === "assistant"
                    ? { ...m, streaming: false }
                    : m,
                ),
              );
            }
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "system", content: `Error: ${error}` },
            ]);
            break;
          }
        }
      });
    })();

    return () => {
      unlisten?.();
      unlistenErr?.();
    };
  }, [flushPendingTextDeltas, queueTextDelta]);

  // Input → slash suggestions
  useEffect(() => {
    queueMicrotask(() => {
      if (input.startsWith("/") && !input.includes(" ")) {
        setSlashSuggestions(getSlashSuggestions(input));
        setSlashIdx(0);
      } else {
        setSlashSuggestions([]);
      }
    });
  }, [input]);

  // Load workspace file list for @mention
  useEffect(() => {
    if (!workspacePath) return;
    invoke<string[]>("list_all_files", { path: workspacePath })
      .then(setWorkspaceFiles)
      .catch(() => {});
  }, [workspacePath]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setSlashSuggestions([]);

    // Slash commands
    const parsed = parseSlashCommand(text);
    if (parsed) {
      handleSlashCommand(parsed.name, parsed.args);
      return;
    }

    if (!bridgeReady) return;
    await sendMessageToAI(text);
  }

  async function handleAddFiles() {
    setContextMenuOpen(false);
    const paths = await invoke<string[]>("open_file_dialog").catch(() => [] as string[]);
    if (!paths.length) return;
    const newItems: ContextItem[] = await Promise.all(
      paths.map(async (p) => {
        const name = p.split("/").pop() ?? p;
        const content = await invoke<string>("read_file_content", { path: p }).catch(
          () => "(could not read file)",
        );
        return { id: crypto.randomUUID(), path: p, name, content };
      }),
    );
    setContextItems((prev) => {
      const existing = new Set(prev.map((c) => c.path));
      return [...prev, ...newItems.filter((c) => !existing.has(c.path))];
    });
  }

  async function handleAddFolder() {
    setContextMenuOpen(false);
    const folder = await invoke<string | null>("open_folder_dialog").catch(() => null);
    if (!folder) return;
    const name = folder.split("/").pop() ?? folder;
    // List files in the folder for context
    const files = await invoke<string[]>("list_all_files", { root: folder, maxFiles: 500 }).catch(
      () => [] as string[],
    );
    const content =
      files.length > 0
        ? files.map((f) => f.replace(folder + "/", "")).join("\n")
        : `(directory: ${folder})`;
    setContextItems((prev) => {
      if (prev.some((c) => c.path === folder)) return prev;
      return [...prev, { id: crypto.randomUUID(), path: folder, name, content, isFolder: true }];
    });
  }

  async function sendMessageToAI(text: string) {
    if (!bridgeReady || streaming) return;

    forceScrollToBottomRef.current = true;

    const prefix = MODE_PREFIXES[mode];

    // Prepend any attached context items + optional active-file auto-context
    const allItems = [...contextItems];

    if (autoContext && activeFile && !allItems.some((c) => c.path === activeFile.path)) {
      const content = await invoke<string>("read_file_content", { path: activeFile.path }).catch(
        () => "(could not read file)",
      );
      allItems.unshift({
        id: "auto-ctx",
        path: activeFile.path,
        name: activeFile.name,
        content,
      });
    }

    let contextBlock = "";
    if (allItems.length > 0) {
      contextBlock =
        allItems
          .map((item) => {
            const truncated =
              item.content.length > 20_000
                ? item.content.slice(0, 20_000) + "\n...[truncated]"
                : item.content;
            const tag = item.isFolder ? "directory" : "file";
            return `<${tag} path="${item.path}">\n${truncated}\n</${tag}>`;
          })
          .join("\n\n") + "\n\n";
      setContextItems([]);
    }

    const bridgeText = `${prefix}${contextBlock}${text}`;

    const userMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: text }]);
    setLastUserMessage(text);

    const assistantMsgId = crypto.randomUUID();
    currentAssistantMsgIdRef.current = assistantMsgId;
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", toolCalls: [], streaming: true },
    ]);
    setStreaming(true);
    const images = imageItems.map((img) => ({
      data: img.dataUrl.split(",")[1] ?? img.dataUrl,
      mimeType: img.mimeType,
    }));
    setImageItems([]);

    await invoke("blink_code_bridge_send", {
      line: JSON.stringify({
        type: "chat",
        assistantMsgId,
        text: bridgeText,
        allowTools: config.allowTools,
        ...(thinkingEnabled ? { thinking: true } : {}),
        ...(images.length > 0 ? { images } : {}),
      }),
    });
  }

  async function handleRetry() {
    if (!lastUserMessage || streaming || !bridgeReady) return;
    // Remove last assistant + any trailing system error messages
    setMessages((prev) => {
      let idx = prev.length - 1;
      while (idx >= 0 && prev[idx].role !== "user") idx--;
      return prev.slice(0, idx + 1);
    });
    await sendMessageToAI(lastUserMessage);
  }

  function handleExport() {
    if (messages.length === 0 || streaming) return;
    let md = "";
    for (const msg of messages) {
      if (!msg.content) continue;
      if (msg.role === "user") {
        md += `**You**\n\n${msg.content}\n\n---\n\n`;
      } else if (msg.role === "assistant") {
        let prefix = "";
        if (msg.toolCalls.length > 0) {
          prefix = `*Used tools: ${msg.toolCalls.map((tc) => tc.name).join(", ")}*\n\n`;
        }
        md += `**Blink**\n\n${prefix}${msg.content}\n\n`;
      } else if (msg.role === "system") {
        md += `*${msg.content}*\n\n---\n\n`;
      }
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blink-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSlashCommand(name: string, args: string) {
    // Prompt-type commands: inject as a user message to the AI
    const promptText = getPromptCommand(name);
    if (promptText) {
      const fullText = args.trim() ? `${promptText}\n\nAdditional context: ${args}` : promptText;
      sendMessageToAI(fullText);
      return;
    }

    switch (name) {
      case "clear":
        pendingTextDeltasRef.current.clear();
        invoke("blink_code_bridge_send", { line: JSON.stringify({ type: "clear" }) }).catch(
          () => {},
        );
        currentAssistantMsgIdRef.current = null;
        forceScrollToBottomRef.current = true;
        setMessages([]);
        setStreaming(false);
        setContextUsage(null);
        break;
      case "model":
        if (args.trim()) {
          const updated = { ...config, provider: { ...config.provider, model: args.trim() } };
          setConfig(updated);
          saveBlinkCodeConfig(updated);
          setMessages([]);
          setStreaming(false);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "system",
              content: `Current model: ${"model" in config.provider ? config.provider.model : config.provider.type}`,
            },
          ]);
        }
        break;
      case "memory":
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "system", content: "Opening AGENTS.md…" },
        ]);
        // Dispatch event to open AGENTS.md in editor
        if (workspacePath) {
          document.dispatchEvent(
            new CustomEvent("blink:open-file", {
              detail: { path: `${workspacePath}/AGENTS.md`, name: "AGENTS.md" },
            }),
          );
        }
        break;
      case "context":
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `Provider: ${config.provider.type}${"model" in config.provider && config.provider.model ? ` / ${config.provider.model}` : ""}\nWorkspace: ${workspacePath ?? "(none)"}\nMessages: ${messages.length} messages`,
          },
        ]);
        break;
      case "compact": {
        const convo = messages.filter((m) => m.role === "user" || m.role === "assistant");
        if (convo.length === 0) break;

        // Keep the most recent 6 messages verbatim — they survive compact intact.
        // Everything older gets summarised. This matches how Claude Code works:
        // recent context stays readable while old context gets compressed.
        const KEEP_RECENT = 6;
        const splitAt = Math.max(0, convo.length - KEEP_RECENT);
        const toSummarise = convo.slice(0, splitAt);
        const toKeep = convo.slice(splitAt);

        // If there's nothing old enough to summarise, fall back to full compact.
        const targetMessages = toSummarise.length > 0 ? toSummarise : convo;
        const kept = toSummarise.length > 0 ? toKeep : [];

        function msgToText(m: PanelMessage): string {
          if (m.role === "user") return `User: ${m.content}`;
          if (m.role === "assistant") {
            const parts: string[] = [];
            if (m.toolCalls.length > 0)
              parts.push(`[Tools used: ${m.toolCalls.map((t) => t.name).join(", ")}]`);
            if (m.content) parts.push(`Assistant: ${m.content}`);
            return parts.join("\n");
          }
          return "";
        }

        const transcript = targetMessages.map(msgToText).filter(Boolean).join("\n\n");

        // getPartialCompactPrompt tells the model it's summarising the OLDER
        // portion of the conversation (recent messages will follow the summary).
        const compactPrompt =
          getPartialCompactPrompt() +
          `\n\nMessages to summarise:\n\n${transcript}`;

        compactKeptRef.current = kept;
        isCompactingRef.current = true;
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "system", content: "Compacting conversation…" },
        ]);
        await sendMessageToAI(compactPrompt);
        break;
      }
      case "help":
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: SLASH_COMMANDS.map((c) => `/${c.name} — ${c.description}`).join("\n"),
          },
        ]);
        break;
    }
  }

  function handleImagePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(e.clipboardData.items).filter((item) =>
      item.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return;
    e.preventDefault();
    for (const item of imageFiles) {
      const file = item.getAsFile();
      if (!file) continue;
      const mimeType = item.type;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setImageItems((prev) => [...prev, { id: crypto.randomUUID(), dataUrl, mimeType }]);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);

    // Detect @mention: find @word right before cursor
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([^\s@]*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      setAtMentionQuery(query);
      setAtMentionIdx(0);
      const filtered = workspaceFiles
        .filter((f) => {
          const name = f.split("/").pop() ?? f;
          return name.toLowerCase().includes(query) || f.toLowerCase().includes(query);
        })
        .slice(0, 12);
      setAtMentionFiles(filtered);
    } else {
      setAtMentionQuery(null);
      setAtMentionFiles([]);
    }
  }

  async function handleAtSelect(filePath: string) {
    // Remove the @query from the input
    const cursor = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const atMatch = before.match(/@([^\s@]*)$/);
    if (atMatch) {
      const start = cursor - atMatch[0].length;
      setInput(input.slice(0, start) + input.slice(cursor));
    }
    setAtMentionQuery(null);
    setAtMentionFiles([]);

    // Add as context item if not already present
    const name = filePath.split("/").pop() ?? filePath;
    if (contextItems.some((c) => c.path === filePath)) {
      textareaRef.current?.focus();
      return;
    }
    const content = await invoke<string>("read_file_content", { path: filePath }).catch(
      () => "(could not read file)",
    );
    setContextItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), path: filePath, name, content },
    ]);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // @mention navigation
    if (atMentionFiles.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAtMentionIdx((i) => Math.min(i + 1, atMentionFiles.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAtMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const f = atMentionFiles[atMentionIdx];
        if (f) handleAtSelect(f);
        return;
      }
      if (e.key === "Escape") {
        setAtMentionQuery(null);
        setAtMentionFiles([]);
        return;
      }
    }

    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => Math.min(i + 1, slashSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const cmd = slashSuggestions[slashIdx];
        if (cmd) setInput(`/${cmd.name} `);
        setSlashSuggestions([]);
        return;
      }
      if (e.key === "Escape") {
        setSlashSuggestions([]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleAbort() {
    invoke("blink_code_bridge_send", {
      line: JSON.stringify({ type: "abort", assistantMsgId: currentAssistantMsgIdRef.current }),
    }).catch(() => {});
    if (permReq) {
      invoke("blink_code_bridge_send", {
        line: JSON.stringify({ type: "permission_response", reqId: permReq.reqId, allowed: false }),
      }).catch(() => {});
      setPermReq(null);
    }
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant" && (m as { streaming?: boolean }).streaming
          ? { ...m, streaming: false }
          : m,
      ),
    );
  }

  function toggleToolCall(msgId: string, callId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.role === "assistant"
          ? {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === callId ? { ...tc, expanded: !tc.expanded } : tc,
              ),
            }
          : m,
      ),
    );
  }

  function handleConfigChange(partial: Partial<BlinkCodeConfig>) {
    const updated = { ...config, ...partial };
    setConfig(updated);
    saveBlinkCodeConfig(updated);
  }

  const isCLIProvider = config.provider.type === "agent";

  // In agent mode the CliAgentPanel has its own header — skip ours entirely
  if (isCLIProvider) {
    return (
      <div className="blink-panel">
        {settingsOpen ? (
          <ProviderSettings
            config={config}
            agentSettings={agentSettings}
            onAgentSettingsChange={(s) => {
              setAgentSettings(s);
              saveAgentSettings(s);
            }}
            onChange={handleConfigChange}
            onClose={() => setSettingsOpen(false)}
          />
        ) : (
          <CliAgentPanel
            workspacePath={workspacePath}
            agentSettings={agentSettings}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="blink-panel">
      {/* Header */}
      <div className="blink-panel__header">
        <div className="blink-panel__thread-picker" ref={threadPickerRef}>
          <button
            type="button"
            className={`blink-panel__thread-btn${threadPickerOpen ? " blink-panel__thread-btn--open" : ""}`}
            onClick={() => {
              setThreadPickerOpen((v) => {
                if (v) setThreadSearch("");
                return !v;
              });
              setRenamingThreadId(null);
            }}
            title="Switch conversation"
          >
            <span className="blink-panel__thread-name">
              {threads.find((t) => t.id === activeThreadId)?.name ?? "Blink"}
            </span>
            <ChevronRight
              size={12}
              className={`blink-panel__thread-chevron${threadPickerOpen ? " blink-panel__thread-chevron--open" : ""}`}
            />
          </button>

          {threadPickerOpen && (
            <div className="blink-panel__thread-dropdown">
              <div className="blink-panel__thread-search-wrap">
                <input
                  ref={threadSearchRef}
                  autoFocus
                  type="text"
                  className="blink-panel__thread-search"
                  placeholder="Search conversations…"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (threadSearch) setThreadSearch("");
                      else setThreadPickerOpen(false);
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="blink-panel__thread-new"
                onClick={() => {
                  setThreadPickerOpen(false);
                  setThreadSearch("");
                  pendingTextDeltasRef.current.clear();
                  invoke("blink_code_bridge_send", {
                    line: JSON.stringify({ type: "new_thread" }),
                  }).catch(() => {});
                  currentAssistantMsgIdRef.current = null;
                  forceScrollToBottomRef.current = true;
                  setStreaming(false);
                }}
              >
                <SquarePen size={13} />
                New conversation
              </button>
              <div className="blink-panel__thread-divider" />
              {threads.filter((t) =>
                !threadSearch.trim() || t.name.toLowerCase().includes(threadSearch.toLowerCase())
              ).map((t) => (
                <div
                  key={t.id}
                  className={`blink-panel__thread-item${t.id === activeThreadId ? " blink-panel__thread-item--active" : ""}`}
                >
                  {renamingThreadId === t.id ? (
                    <input
                      className="blink-panel__thread-rename-input"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          invoke("blink_code_bridge_send", {
                            line: JSON.stringify({
                              type: "rename_thread",
                              threadId: t.id,
                              name: renameValue,
                            }),
                          }).catch(() => {});
                          setRenamingThreadId(null);
                        }
                        if (e.key === "Escape") setRenamingThreadId(null);
                      }}
                      onBlur={() => {
                        if (renameValue.trim()) {
                          invoke("blink_code_bridge_send", {
                            line: JSON.stringify({
                              type: "rename_thread",
                              threadId: t.id,
                              name: renameValue,
                            }),
                          }).catch(() => {});
                        }
                        setRenamingThreadId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="blink-panel__thread-item-btn"
                      onClick={() => {
                        if (t.id === activeThreadId) {
                          setThreadPickerOpen(false);
                          return;
                        }
                        setThreadPickerOpen(false);
                        pendingTextDeltasRef.current.clear();
                        setStreaming(false);
                        forceScrollToBottomRef.current = true;
                        invoke("blink_code_bridge_send", {
                          line: JSON.stringify({ type: "switch_thread", threadId: t.id }),
                        }).catch(() => {});
                      }}
                    >
                      <div className="blink-panel__thread-item-info">
                        <span className="blink-panel__thread-item-name">{t.name}</span>
                        <span className="blink-panel__thread-item-time">
                          {formatRelativeTime(t.updatedAt)}
                          {t.messageCount > 0 && ` · ${Math.ceil(t.messageCount / 2)} msgs`}
                        </span>
                      </div>
                    </button>
                  )}
                  <div className="blink-panel__thread-item-actions">
                    <button
                      type="button"
                      title="Rename"
                      className="blink-panel__thread-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingThreadId(t.id);
                        setRenameValue(t.name);
                      }}
                    >
                      <SquarePen size={11} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      className="blink-panel__thread-action-btn blink-panel__thread-action-btn--danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        invoke("blink_code_bridge_send", {
                          line: JSON.stringify({ type: "delete_thread", threadId: t.id }),
                        }).catch(() => {});
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="blink-panel__header-actions">
          {messages.length > 0 && !streaming && (
            <button
              type="button"
              className="blink-panel__icon-btn"
              title="Export conversation"
              onClick={handleExport}
            >
              <Download size={14} />
            </button>
          )}
          <button
            type="button"
            className={`blink-panel__icon-btn${settingsOpen ? " blink-panel__icon-btn--active" : ""}`}
            title="Settings"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      {settingsOpen ? (
        /* Settings overlay */
        <ProviderSettings
          config={config}
          agentSettings={agentSettings}
          onAgentSettingsChange={(s) => {
            setAgentSettings(s);
            saveAgentSettings(s);
          }}
          onChange={handleConfigChange}
          onClose={() => setSettingsOpen(false)}
        />
      ) : (
        <>
          {/* Messages */}
          <div className="blink-panel__messages" ref={messagesScrollRef}>
            {messages.length === 0 && (
              <div className="blink-panel__empty">
                <span>Ask anything about your code</span>
                <span className="blink-panel__empty-hint">/ for commands</span>
              </div>
            )}
            {messages.map((msg, idx) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                onToggleTool={(callId) => toggleToolCall(msg.id, callId)}
                isLast={idx === messages.length - 1}
                onRetry={handleRetry}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Permission dialog */}
          {permReq && (
            <PermissionDialog
              toolName={permReq.toolName}
              input={permReq.input}
              onAllow={() => {
                invoke("blink_code_bridge_send", {
                  line: JSON.stringify({
                    type: "permission_response",
                    reqId: permReq.reqId,
                    allowed: true,
                  }),
                }).catch(() => {});
                setPermReq(null);
              }}
              onDeny={() => {
                invoke("blink_code_bridge_send", {
                  line: JSON.stringify({
                    type: "permission_response",
                    reqId: permReq.reqId,
                    allowed: false,
                  }),
                }).catch(() => {});
                setPermReq(null);
              }}
            />
          )}

          {/* Input card */}
          <div className="blink-panel__input-wrap">
            {atMentionFiles.length > 0 && (
              <div className="blink-panel__at-menu">
                {atMentionFiles.map((f, i) => {
                  const name = f.split("/").pop() ?? f;
                  const rel = workspacePath ? f.replace(workspacePath + "/", "") : f;
                  return (
                    <button
                      key={f}
                      type="button"
                      className={`blink-panel__at-item${i === atMentionIdx ? " blink-panel__at-item--active" : ""}`}
                      onMouseEnter={() => setAtMentionIdx(i)}
                      onClick={() => handleAtSelect(f)}
                    >
                      <FileText size={12} />
                      <span className="blink-panel__at-name">{name}</span>
                      <span className="blink-panel__at-path">{rel}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {slashSuggestions.length > 0 && (
              <div className="blink-panel__slash-menu">
                {slashSuggestions.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    type="button"
                    className={`blink-panel__slash-item${i === slashIdx ? " blink-panel__slash-item--active" : ""}`}
                    onMouseEnter={() => setSlashIdx(i)}
                    onClick={() => {
                      setInput(`/${cmd.name} `);
                      setSlashSuggestions([]);
                      textareaRef.current?.focus();
                    }}
                  >
                    <span className="blink-panel__slash-name">/{cmd.name}</span>
                    <span className="blink-panel__slash-desc">{cmd.description}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="blink-panel__input-card">
              {(contextItems.length > 0 ||
                imageItems.length > 0 ||
                (autoContext && activeFile)) && (
                <div className="blink-panel__context-files">
                  {imageItems.map((img) => (
                    <span
                      key={img.id}
                      className="blink-panel__context-chip blink-panel__context-chip--image"
                    >
                      <img src={img.dataUrl} alt="pasted" className="blink-panel__img-thumb" />
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => setImageItems((prev) => prev.filter((i) => i.id !== img.id))}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {autoContext && activeFile && (
                    <span className="blink-panel__context-chip">
                      <FileText size={11} />
                      {activeFile.name}
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => {
                          setAutoContext(false);
                          localStorage.setItem("blink-auto-context", "false");
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {contextItems.map((item) => (
                    <span key={item.id} className="blink-panel__context-chip">
                      {item.isFolder ? <Folder size={11} /> : <FileText size={11} />}
                      {item.name}
                      <button
                        type="button"
                        title="Remove"
                        onClick={() =>
                          setContextItems((prev) => prev.filter((c) => c.id !== item.id))
                        }
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {bridgeInitFailed && !bridgeReady ? (
                <div className="blink-panel__bridge-error">
                  <span>Failed to connect to AI bridge.</span>
                  <button
                    type="button"
                    className="blink-panel__reconnect-btn"
                    onClick={() => {
                      setBridgeInitFailed(false);
                      bridgeKeyRef.current = null;
                      setBridgeRetryKey((k) => k + 1);
                    }}
                  >
                    Reconnect
                  </button>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  className="blink-panel__textarea"
                  placeholder={streaming ? "" : "Message Blink…"}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handleImagePaste}
                  rows={1}
                  disabled={!bridgeReady && !streaming}
                />
              )}
              <div className="blink-panel__input-footer">
                <div className="blink-panel__ctx-btn-wrap" ref={contextMenuRef}>
                  <button
                    type="button"
                    className={`blink-panel__ctx-btn${contextMenuOpen ? " blink-panel__ctx-btn--active" : ""}`}
                    title="Add context"
                    onClick={() => setContextMenuOpen((v) => !v)}
                  >
                    <Plus size={13} />
                  </button>
                  {contextMenuOpen && (
                    <div className="blink-panel__ctx-menu">
                      <button
                        type="button"
                        className="blink-panel__ctx-menu-item"
                        onClick={handleAddFiles}
                      >
                        <FileText size={13} />
                        Files
                      </button>
                      <button
                        type="button"
                        className="blink-panel__ctx-menu-item"
                        onClick={handleAddFolder}
                      >
                        <Folder size={13} />
                        Folder
                      </button>
                      {activeFile && !autoContext && (
                        <button
                          type="button"
                          className="blink-panel__ctx-menu-item"
                          onClick={() => {
                            setAutoContext(true);
                            localStorage.setItem("blink-auto-context", "true");
                            setContextMenuOpen(false);
                          }}
                        >
                          <FileText size={13} />
                          Active file
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <ModePill mode={mode} onChange={setMode} />
                <button
                  type="button"
                  className={`blink-panel__thinking-btn${thinkingEnabled ? " blink-panel__thinking-btn--on" : ""}`}
                  title={thinkingEnabled ? "Extended thinking on" : "Extended thinking off"}
                  onClick={() => {
                    const next = !thinkingEnabled;
                    setThinkingEnabled(next);
                    localStorage.setItem("blink-thinking", String(next));
                  }}
                >
                  <Brain size={13} />
                </button>
                <ModelPill config={config} onChange={handleConfigChange} />
                {contextUsage && (
                  <ContextCircle
                    inputTokens={contextUsage.inputTokens}
                    model={"model" in config.provider ? (config.provider.model ?? "") : ""}
                  />
                )}
                <button
                  type="button"
                  className="blink-panel__send-btn"
                  onClick={streaming ? handleAbort : handleSend}
                  disabled={!streaming && (!bridgeReady || !input.trim())}
                  title={streaming ? "Stop" : "Send"}
                >
                  {streaming ? (
                    <Square size={13} fill="currentColor" />
                  ) : (
                    <ArrowUp size={14} strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── MessageRow ────────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  onToggleTool,
  isLast,
  onRetry,
}: {
  msg: PanelMessage;
  onToggleTool: (id: string) => void;
  isLast?: boolean;
  onRetry?: () => void;
}) {
  if (msg.role === "system") {
    return (
      <div className="blink-msg blink-msg--system">
        <span className="blink-msg__system-text">{msg.content}</span>
        {msg.content.startsWith("Error:") && isLast && onRetry && (
          <button type="button" className="blink-msg__retry-btn" onClick={onRetry} title="Retry">
            <RefreshCw size={11} />
          </button>
        )}
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="blink-msg blink-msg--user">
        <div className="blink-msg__bubble">{msg.content}</div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="blink-msg blink-msg--assistant">
      {msg.thinkingContent && (
        <ThinkingBlock content={msg.thinkingContent} streaming={msg.streaming && !msg.content} />
      )}
      {msg.toolCalls.map((tc) => (
        <ToolCallRow key={tc.id} call={tc} onToggle={() => onToggleTool(tc.id)} />
      ))}
      {msg.content && (
        <div className="blink-msg__text">
          <MarkdownText text={msg.content} />
          {msg.streaming && <span className="blink-msg__cursor" />}
        </div>
      )}
      {msg.streaming && !msg.content && !msg.toolCalls.length && !msg.thinkingContent && (
        <div className="blink-msg__thinking">
          <span className="blink-msg__dot" />
          <span className="blink-msg__dot" />
          <span className="blink-msg__dot" />
        </div>
      )}
      {isLast && !msg.streaming && msg.content && onRetry && (
        <button
          type="button"
          className="blink-msg__regen-btn"
          onClick={onRetry}
          title="Regenerate response"
        >
          <RefreshCw size={11} />
        </button>
      )}
    </div>
  );
}

// ── ThinkingBlock ─────────────────────────────────────────────────────────────

function ThinkingBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`blink-thinking${streaming ? " blink-thinking--streaming" : ""}`}>
      <button
        type="button"
        className="blink-thinking__header"
        onClick={() => setExpanded((v) => !v)}
      >
        <Brain size={11} className="blink-thinking__icon" />
        <span className="blink-thinking__label">
          {streaming ? "Thinking…" : "Extended thinking"}
        </span>
        {streaming && <span className="blink-thinking__spinner" />}
        <ChevronRight
          size={10}
          className={`blink-thinking__chevron${expanded ? " blink-thinking__chevron--open" : ""}`}
        />
      </button>
      {expanded && <pre className="blink-thinking__content">{content}</pre>}
    </div>
  );
}

// ── ToolCallRow ───────────────────────────────────────────────────────────────

function ToolCallRow({ call, onToggle }: { call: ToolCallEntry; onToggle: () => void }) {
  const done = call.result !== undefined;
  return (
    <div
      className={`blink-tool ${done ? (call.is_error ? "blink-tool--error" : "blink-tool--done") : "blink-tool--pending"}`}
    >
      <button type="button" className="blink-tool__header" onClick={onToggle}>
        <Wrench size={11} className="blink-tool__icon" />
        <span className="blink-tool__name">{call.name}</span>
        {!done && <span className="blink-tool__spinner" />}
        {done && call.is_error && <AlertCircle size={11} className="blink-tool__err-icon" />}
        {done && !call.is_error && <Check size={11} className="blink-tool__ok-icon" />}
        <ChevronRight
          size={10}
          className={`blink-tool__chevron ${call.expanded ? "blink-tool__chevron--open" : ""}`}
        />
      </button>
      {call.expanded && call.result && (
        <pre className="blink-tool__output">
          {call.result.slice(0, 2000)}
          {call.result.length > 2000 ? "\n…" : ""}
        </pre>
      )}
    </div>
  );
}

// ── PermissionDialog ──────────────────────────────────────────────────────────

function PermissionDialog({
  toolName,
  input,
  onAllow,
  onDeny,
}: {
  toolName: string;
  input: Record<string, unknown>;
  onAllow: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="blink-perm">
      <div className="blink-perm__title">
        <Wrench size={12} />
        Allow <strong>{toolName}</strong>?
      </div>
      <pre className="blink-perm__input">{JSON.stringify(input, null, 2).slice(0, 400)}</pre>
      <div className="blink-perm__actions">
        <button type="button" className="btn btn--sm btn--ghost" onClick={onDeny}>
          <X size={12} /> Deny
        </button>
        <button type="button" className="btn btn--sm btn--accent" onClick={onAllow}>
          <Check size={12} /> Allow
        </button>
      </div>
    </div>
  );
}

// ── ModePill ──────────────────────────────────────────────────────────────────

function ModePill({ mode, onChange }: { mode: ChatMode; onChange: (m: ChatMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = MODES.find((m) => m.value === mode) ?? MODES[0];
  const CurrentIcon = current.icon;

  return (
    <div className="blink-model-pill" ref={ref}>
      <button type="button" className="blink-model-pill__btn" onClick={() => setOpen((v) => !v)}>
        <CurrentIcon size={11} />
        <span className="blink-model-pill__name">{current.label}</span>
        <ChevronRight
          size={10}
          className={`blink-model-pill__chevron${open ? " blink-model-pill__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="blink-model-pill__dropdown">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                type="button"
                className={`blink-model-pill__option blink-model-pill__option--with-icon${m.value === mode ? " blink-model-pill__option--active" : ""}`}
                onClick={() => {
                  onChange(m.value);
                  setOpen(false);
                }}
              >
                <Icon size={12} />
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ContextCircle ─────────────────────────────────────────────────────────────

function ContextCircle({ inputTokens, model }: { inputTokens: number; model: string }) {
  const window = CONTEXT_WINDOWS[model];
  const pct = window ? Math.min(inputTokens / window, 1) : null;

  const SIZE = 18;
  const STROKE = 2;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;

  const used = inputTokens >= 1000 ? `${(inputTokens / 1000).toFixed(1)}k` : `${inputTokens}`;
  const total = window ? (window >= 1000 ? `${window / 1000}k` : `${window}`) : null;
  const pctStr = pct != null ? `${(pct * 100).toFixed(0)}%` : null;

  const color =
    pct == null
      ? "var(--c-muted-fg)"
      : pct > 0.85
        ? "var(--c-danger)"
        : pct > 0.6
          ? "var(--c-warning, #f59e0b)"
          : "var(--c-accent)";

  const label = total ? `${used} / ${total}` : used;

  return (
    <div className="blink-panel__ctx-ring">
      <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--c-border)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={pct != null ? CIRC * (1 - pct) : CIRC * 0.85}
        />
      </svg>
      <span className="blink-panel__ctx-label">{label}</span>
      <div className="blink-panel__ctx-tooltip">
        <strong>Context</strong>
        {pctStr && ` ${pctStr}`}
        {total ? ` · ${used} / ${total}` : ` · ${used}`}
      </div>
    </div>
  );
}

// ── ModelPill ─────────────────────────────────────────────────────────────────

function modelPillLabel(config: BlinkCodeConfig): string {
  const p = config.provider;
  if (p.type === "agent") return "Agent";
  return p.model || "—";
}

function ModelPill({
  config,
  onChange,
}: {
  config: BlinkCodeConfig;
  onChange: (p: Partial<BlinkCodeConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const ptype = config.provider.type;
  const baseUrl = ptype === "openai-compat" ? (config.provider.baseUrl ?? "") : null;

  // Fetch model list for openai-compat endpoints
  useEffect(() => {
    if (!open || !baseUrl) return;
    const apiKey =
      config.provider.type === "openai-compat" ? (config.provider.apiKey ?? "ollama") : "ollama";
    fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then((r) => r.json())
      .then((d: { data?: Array<{ id: string }> }) =>
        setFetchedModels((d.data ?? []).map((m) => m.id).sort()),
      )
      .catch(() => setFetchedModels([]));
  }, [open, baseUrl]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = modelPillLabel(config);
  const currentModel = ptype === "openai-compat" ? config.provider.model : "";

  // Agent mode — pill is non-interactive (config lives in settings)
  if (ptype === "agent") {
    return null;
  }

  return (
    <div className="blink-model-pill" ref={ref}>
      <button type="button" className="blink-model-pill__btn" onClick={() => setOpen((v) => !v)}>
        <span className="blink-model-pill__name">{label}</span>
        <ChevronRight
          size={10}
          className={`blink-model-pill__chevron${open ? " blink-model-pill__chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="blink-model-pill__dropdown">
          {fetchedModels.length > 0 ? (
            fetchedModels.map((m) => (
              <button
                key={m}
                type="button"
                className={`blink-model-pill__option${m === currentModel ? " blink-model-pill__option--active" : ""}`}
                onClick={() => {
                  if (config.provider.type === "openai-compat") {
                    onChange({ provider: { ...config.provider, model: m } });
                  }
                  setOpen(false);
                }}
              >
                {m}
              </button>
            ))
          ) : (
            <div className="blink-model-pill__empty">No models found</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ProviderSettings ──────────────────────────────────────────────────────────

function ProviderSettings({
  config,
  agentSettings,
  onAgentSettingsChange,
  onChange,
  onClose,
}: {
  config: BlinkCodeConfig;
  agentSettings: AgentSettings;
  onAgentSettingsChange: (s: AgentSettings) => void;
  onChange: (p: Partial<BlinkCodeConfig>) => void;
  onClose: () => void;
}) {
  const ptype = config.provider.type;
  const activePreset = ptype === "agent" ? "agent" : "custom";

  // Live model list for openai-compat
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const baseUrl = ptype === "openai-compat" ? (config.provider.baseUrl ?? "") : null;

  useEffect(() => {
    if (!baseUrl) {
      setAvailableModels([]);
      return;
    }
    const apiKey = ptype === "openai-compat" ? (config.provider.apiKey ?? "ollama") : "ollama";
    fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then((r) => r.json())
      .then((data: { data?: Array<{ id: string }> }) => {
        const models = (data.data ?? []).map((m) => m.id).sort();
        setAvailableModels(models);
        if (models.length > 0 && ptype === "openai-compat" && !config.provider.model) {
          onChange({ provider: { ...config.provider, model: models[0] } });
        }
      })
      .catch(() => setAvailableModels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  // Expanded path rows per agent
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  function applyPreset(value: string) {
    onChange({ provider: presetToConfig(value) });
  }

  function toggleAgent(id: string, enabled: boolean) {
    const next = { ...agentSettings, [id]: { ...agentSettings[id], enabled } };
    onAgentSettingsChange(next);
  }

  function setAgentPath(id: string, customPath: string) {
    const next = { ...agentSettings, [id]: { ...agentSettings[id], customPath } };
    onAgentSettingsChange(next);
  }

  const currentModel = ptype === "openai-compat" ? config.provider.model : "";

  return (
    <div className="blink-settings-panel">
      <div className="blink-settings-panel__header">
        <button type="button" className="blink-settings-panel__back" onClick={onClose}>
          <X size={14} /> Done
        </button>
        <span className="blink-settings-panel__title">Provider Settings</span>
      </div>
      <div className="blink-settings-panel__body">
        {/* Mode selector */}
        <div className="blink-settings-panel__card">
          <div className="blink-settings-panel__field">
            <label>Mode</label>
            <select value={activePreset} onChange={(e) => applyPreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Agent mode: agent list with toggles + paths ── */}
        {activePreset === "agent" && (
          <div className="blink-settings-panel__agent-list">
            {ALL_AGENTS.map((agent) => {
              const cfg = agentSettings[agent.id] ?? { enabled: false, customPath: "" };
              const pathExpanded = expandedPaths[agent.id] ?? false;
              return (
                <div key={agent.id} className="blink-settings-panel__agent-row">
                  <div className="blink-settings-panel__agent-info">
                    <span className="blink-settings-panel__agent-logo">
                      <AgentLogo agentId={agent.id} size={18} />
                    </span>
                    <div className="blink-settings-panel__agent-text">
                      <span className="blink-settings-panel__agent-name">{agent.label}</span>
                      <span className="blink-settings-panel__agent-desc">{agent.description}</span>
                    </div>
                  </div>
                  <div className="blink-settings-panel__agent-controls">
                    {cfg.enabled && (
                      <button
                        type="button"
                        className="blink-settings-panel__agent-path-toggle"
                        title="Configure path"
                        onClick={() =>
                          setExpandedPaths((p) => ({ ...p, [agent.id]: !p[agent.id] }))
                        }
                      >
                        <Settings2 size={11} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`toggle ${cfg.enabled ? "toggle--on" : ""}`}
                      onClick={() => toggleAgent(agent.id, !cfg.enabled)}
                    >
                      <span className="toggle__thumb" />
                    </button>
                  </div>
                  {cfg.enabled && pathExpanded && (
                    <div className="blink-settings-panel__agent-path">
                      <label>Custom path</label>
                      <input
                        value={cfg.customPath}
                        onChange={(e) => setAgentPath(agent.id, e.target.value)}
                        placeholder={`/usr/local/bin/${agent.binary}`}
                        spellCheck={false}
                      />
                      <span className="blink-settings-panel__agent-path-hint">
                        Leave empty to use <code>{agent.binary}</code> from PATH
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Custom mode: URL + key + model ── */}
        {activePreset === "custom" && config.provider.type === "openai-compat" && (
          <>
            <div className="blink-settings-panel__card">
              <div className="blink-settings-panel__field">
                <label>Model</label>
                {availableModels.length > 0 ? (
                  <select
                    value={currentModel}
                    onChange={(e) =>
                      config.provider.type === "openai-compat" &&
                      onChange({ provider: { ...config.provider, model: e.target.value } })
                    }
                  >
                    {!availableModels.includes(currentModel) && currentModel && (
                      <option value={currentModel}>{currentModel}</option>
                    )}
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={currentModel}
                    onChange={(e) =>
                      config.provider.type === "openai-compat" &&
                      onChange({ provider: { ...config.provider, model: e.target.value } })
                    }
                    placeholder="e.g. llama3.2 or gpt-4o"
                  />
                )}
              </div>
            </div>
            <div className="blink-settings-panel__card">
              <div className="blink-settings-panel__field">
                <label>Base URL</label>
                <input
                  value={ptype === "openai-compat" ? (config.provider.baseUrl ?? "") : ""}
                  onChange={(e) => {
                    if (config.provider.type !== "openai-compat") return;
                    onChange({ provider: { ...config.provider, baseUrl: e.target.value } });
                  }}
                  placeholder="http://localhost:11434/v1"
                />
              </div>
              <div className="blink-settings-panel__field">
                <label>API Key</label>
                <input
                  type="password"
                  value={ptype === "openai-compat" ? (config.provider.apiKey ?? "") : ""}
                  onChange={(e) => {
                    if (config.provider.type !== "openai-compat") return;
                    onChange({ provider: { ...config.provider, apiKey: e.target.value } });
                  }}
                  placeholder="sk-… (leave empty for Ollama)"
                />
              </div>
            </div>
            <div className="blink-settings-panel__card">
              <div className="blink-settings-panel__field blink-settings-panel__field--row">
                <label>Enable tool use</label>
                <button
                  type="button"
                  className={`toggle ${config.allowTools !== false ? "toggle--on" : ""}`}
                  onClick={() =>
                    onChange({ allowTools: config.allowTools === false ? true : false })
                  }
                >
                  <span className="toggle__thumb" />
                </button>
              </div>
              {config.allowTools !== false && (
                <div className="blink-settings-panel__field blink-settings-panel__field--row">
                  <label>Require permission for tools</label>
                  <button
                    type="button"
                    className={`toggle ${config.requirePermission ? "toggle--on" : ""}`}
                    onClick={() => onChange({ requirePermission: !config.requirePermission })}
                  >
                    <span className="toggle__thumb" />
                  </button>
                </div>
              )}
              <div className="blink-settings-panel__field blink-settings-panel__field--row">
                <label>Max turns</label>
                <input
                  type="number"
                  min={1}
                  max={64}
                  style={{ width: 64, textAlign: "right" }}
                  value={config.maxTurns}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(64, Number(e.target.value)));
                    if (!isNaN(val)) onChange({ maxTurns: val });
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── CodeBlock ─────────────────────────────────────────────────────────────────

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const codeText = typeof children === "string"
    ? children
    : Array.isArray(children)
    ? children.join("")
    : String(children ?? "");

  function handleCopy() {
    navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleApply() {
    document.dispatchEvent(
      new CustomEvent("blink:apply-code", { detail: { code: codeText } }),
    );
    setApplied(true);
    setTimeout(() => setApplied(false), 1500);
  }

  return (
    <div className="blink-msg__code-wrap">
      <div className="blink-msg__code-actions">
        <button
          type="button"
          className="blink-msg__code-btn"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? <Check size={12} /> : <FileText size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          className="blink-msg__code-btn blink-msg__code-btn--apply"
          onClick={handleApply}
          title="Apply to active file"
        >
          {applied ? <Check size={12} /> : <Download size={12} />}
          {applied ? "Applied" : "Apply"}
        </button>
      </div>
      <pre className="blink-msg__code-block">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

// ── MarkdownText ──────────────────────────────────────────────────────────────

const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return <CodeBlock className={className}>{children}</CodeBlock>;
          }
          return (
            <code className="blink-msg__inline-code" {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          // Unwrap — code component above already wraps in pre
          return <>{children}</>;
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
});

export default memo(BlinkCodePanel);
