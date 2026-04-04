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
} from "lucide-react";
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
import type { BridgeOutEvent, HistoryDisplayMessage } from "@contracts/bridge-protocol";

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
  { label: "Ollama (local)", value: "ollama" },
  { label: "Anthropic (direct)", value: "anthropic" },
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Custom…", value: "custom" },
];

const CLAUDE_MODELS = [
  {
    label: "Opus 4.6",
    value: "claude-opus-4-6",
    description: "Most capable for ambitious work",
  },
  {
    label: "Sonnet 4.6",
    value: "claude-sonnet-4-6",
    description: "Most efficient for everyday tasks",
  },
  {
    label: "Haiku 4.5",
    value: "claude-haiku-4-5-20251001",
    description: "Fastest for quick answers",
  },
];

const CLAUDE_EFFORT_LEVELS: Array<{ label: string; value: "low" | "medium" | "high" }> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const CODEX_EFFORT_LEVELS: Array<{ label: string; value: "low" | "medium" | "high" | "xhigh" }> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "X-High", value: "xhigh" },
];

const ANTHROPIC_MODELS = [
  {
    label: "Opus 4.6",
    value: "claude-opus-4-6",
    description: "Most capable for ambitious work",
  },
  {
    label: "Sonnet 4.6",
    value: "claude-sonnet-4-6",
    description: "Most efficient for everyday tasks",
  },
  {
    label: "Haiku 4.5",
    value: "claude-haiku-4-5-20251001",
    description: "Fastest for quick answers",
  },
];

const CODEX_MODELS = [
  { label: "GPT-5.4", value: "gpt-5.4", description: "Flagship frontier model" },
  { label: "GPT-5.4-Mini", value: "gpt-5.4-mini", description: "Fast, lower-cost option" },
  { label: "GPT-5.3-Codex", value: "gpt-5.3-codex", description: "Industry-leading coding model" },
  {
    label: "GPT-5.3-Codex-Spark",
    value: "gpt-5.3-codex-spark",
    description: "Near-instant coding iteration",
  },
  { label: "GPT-5.2-Codex", value: "gpt-5.2-codex", description: "Previous generation codex" },
  { label: "GPT-5.2", value: "gpt-5.2", description: "Previous generation" },
  { label: "GPT-5.1-Codex-Max", value: "gpt-5.1-codex-max", description: "Max capacity model" },
  { label: "GPT-5.1-Codex", value: "gpt-5.1-codex", description: "Earlier codex generation" },
];

function presetToConfig(preset: string): BlinkCodeConfig["provider"] {
  switch (preset) {
    case "ollama":
      return {
        type: "openai-compat",
        model: "", // auto-filled from /models list
        baseUrl: "http://localhost:11434/v1",
        apiKey: "ollama",
        maxTokens: 4096,
      };
    case "anthropic":
      return {
        type: "anthropic",
        model: ANTHROPIC_MODELS[0].value,
        apiKey: "",
        thinking: false,
        thinkingBudget: 10000,
      };
    case "claude-code":
      return { type: "claude-code", model: CLAUDE_MODELS[1].value, effort: "medium" }; // Sonnet 4.6
    case "codex":
      return { type: "codex", model: CODEX_MODELS[0].value, effort: "high" }; // GPT-5.4
    default:
      // "custom" is handled before calling this function — should never reach here
      return { type: "openai-compat", model: "", baseUrl: "", apiKey: "", maxTokens: 4096 };
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

function BlinkCodePanel() {
  const workspacePath = useAppStore((s) => s.activeWorkspace()?.path ?? null);
  const workspaceName = useAppStore((s) => s.activeWorkspace()?.name ?? null);

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

  const [bridgeReady, setBridgeReady] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<string[]>(["ollama", "custom"]);
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

  // Start/initialize bridge whenever bridgeKey changes
  useEffect(() => {
    if (!workspacePath) return;

    let cancelled = false;
    const run = async () => {
      // Avoid double-inits when React re-renders quickly.
      if (bridgeKeyRef.current === bridgeKey) return;
      bridgeKeyRef.current = bridgeKey;

      bridgeReadyRef.current = false;
      setBridgeReady(false);
      setStreaming(false);
      setPermReq(null);
      currentAssistantMsgIdRef.current = null;
      forceScrollToBottomRef.current = true;
      setMessages([]);

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
      setMessages([
        { id: crypto.randomUUID(), role: "system", content: `Bridge init failed: ${e}` },
      ]);
    });

    return () => {
      cancelled = true;
    };
  }, [bridgeKey, workspacePath, workspaceName]);

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
            if (msg.availableProviders) {
              setAvailableProviders(msg.availableProviders);
            }
            // History messages arrive in a separate "history" event right after
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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId && m.role === "assistant" ? { ...m, streaming: false } : m,
              ),
            );
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

  async function sendMessageToAI(text: string) {
    if (!bridgeReady || streaming) return;

    forceScrollToBottomRef.current = true;

    const prefix = MODE_PREFIXES[mode];
    const bridgeText = prefix ? `${prefix}${text}` : text;

    const userMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: text }]);

    const assistantMsgId = crypto.randomUUID();
    currentAssistantMsgIdRef.current = assistantMsgId;
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", toolCalls: [], streaming: true },
    ]);
    setStreaming(true);
    // Detect "ultrathink" keyword — enables extended thinking for this turn
    // (only meaningful for the Anthropic direct provider)
    const isUltrathink =
      config.provider.type === "anthropic" && /\bultrathink\b/i.test(text);

    await invoke("blink_code_bridge_send", {
      line: JSON.stringify({
        type: "chat",
        assistantMsgId,
        text: bridgeText,
        ...(isUltrathink ? { thinking: true } : {}),
      }),
    });
  }

  function handleSlashCommand(name: string, args: string) {
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
              content: `Current model: ${config.provider.model ?? config.provider.type}`,
            },
          ]);
        }
        break;
      case "memory":
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "system", content: "Opening BLINK.md…" },
        ]);
        // Dispatch event to open BLINK.md in editor
        if (workspacePath) {
          document.dispatchEvent(
            new CustomEvent("blink:open-file", {
              detail: { path: `${workspacePath}/BLINK.md`, name: "BLINK.md" },
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
            content: `Provider: ${config.provider.type}${config.provider.model ? ` / ${config.provider.model}` : ""}\nWorkspace: ${workspacePath ?? "(none)"}\nMessages: ${messages.length} messages`,
          },
        ]);
        break;
      case "compact":
        // For now, compact is implemented as "start fresh" in the bridge.
        pendingTextDeltasRef.current.clear();
        forceScrollToBottomRef.current = true;
        setMessages([]);
        invoke("blink_code_bridge_send", { line: JSON.stringify({ type: "clear" }) }).catch(
          () => {},
        );
        setStreaming(false);
        break;
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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

  return (
    <div className="blink-panel">
      {/* Header */}
      <div className="blink-panel__header">
        <span className="blink-panel__title">Blink</span>
        <div className="blink-panel__header-actions">
          <button
            type="button"
            className="blink-panel__icon-btn"
            title="New conversation"
            onClick={() => {
              pendingTextDeltasRef.current.clear();
              invoke("blink_code_bridge_send", { line: JSON.stringify({ type: "clear" }) }).catch(
                () => {},
              );
              currentAssistantMsgIdRef.current = null;
              forceScrollToBottomRef.current = true;
              setMessages([]);
              setStreaming(false);
            }}
          >
            <SquarePen size={14} />
          </button>
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
          availableProviders={availableProviders}
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
            {messages.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                onToggleTool={(callId) => toggleToolCall(msg.id, callId)}
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
              <textarea
                ref={textareaRef}
                className="blink-panel__textarea"
                placeholder={streaming ? "" : "Message Blink…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={!bridgeReady && !streaming}
              />
              <div className="blink-panel__input-footer">
                <ModePill mode={mode} onChange={setMode} />
                <ModelPill config={config} onChange={handleConfigChange} />
                {config.provider.type === "anthropic" &&
                  (config.provider.thinking || /\bultrathink\b/i.test(input)) && (
                    <span className="blink-panel__thinking-badge" title="Extended thinking enabled">
                      <Brain size={11} />
                    </span>
                  )}
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
}: {
  msg: PanelMessage;
  onToggleTool: (id: string) => void;
}) {
  if (msg.role === "system") {
    return (
      <div className="blink-msg blink-msg--system">
        <span className="blink-msg__system-text">{msg.content}</span>
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
    </div>
  );
}

// ── ThinkingBlock ─────────────────────────────────────────────────────────────

function ThinkingBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`blink-thinking${streaming ? " blink-thinking--streaming" : ""}`}>
      <button type="button" className="blink-thinking__header" onClick={() => setExpanded((v) => !v)}>
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
    pct == null ? "var(--c-muted-fg)" : pct > 0.85 ? "var(--c-danger)" : pct > 0.6 ? "var(--c-warning, #f59e0b)" : "var(--c-accent)";

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
  if (p.type === "claude-code") {
    return CLAUDE_MODELS.find((m) => m.value === p.model)?.label ?? p.model ?? "claude";
  }
  if (p.type === "anthropic") {
    return ANTHROPIC_MODELS.find((m) => m.value === p.model)?.label ?? p.model;
  }
  if (p.type === "codex") {
    return CODEX_MODELS.find((m) => m.value === p.model)?.label ?? p.model ?? "codex";
  }
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
  const currentModel =
    ptype === "claude-code" || ptype === "anthropic" || ptype === "codex"
      ? config.provider.model ?? ""
      : ptype === "openai-compat"
        ? config.provider.model
        : "";

  const currentEffort =
    ptype === "claude-code"
      ? (config.provider.effort ?? "medium")
      : ptype === "codex"
        ? (config.provider.effort ?? "high")
        : null;

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
          {/* Static model list for claude-code */}
          {ptype === "claude-code" && (
            <>
              {CLAUDE_MODELS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`blink-model-pill__option blink-model-pill__option--with-desc${m.value === currentModel ? " blink-model-pill__option--active" : ""}`}
                  onClick={() => {
                    onChange({ provider: { ...config.provider, model: m.value } });
                    setOpen(false);
                  }}
                >
                  <span className="blink-model-pill__option-label">{m.label}</span>
                  <span className="blink-model-pill__option-desc">{m.description}</span>
                </button>
              ))}
              <div className="blink-model-pill__divider" />
              <div className="blink-model-pill__section-label">Effort</div>
              {CLAUDE_EFFORT_LEVELS.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  className={`blink-model-pill__option${currentEffort === e.value ? " blink-model-pill__option--active" : ""}`}
                  onClick={() => {
                    if (config.provider.type === "claude-code")
                      onChange({ provider: { ...config.provider, effort: e.value } });
                    setOpen(false);
                  }}
                >
                  {e.label}
                </button>
              ))}
            </>
          )}

          {/* Static model list for anthropic */}
          {ptype === "anthropic" && (
            <>
              {ANTHROPIC_MODELS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`blink-model-pill__option blink-model-pill__option--with-desc${m.value === currentModel ? " blink-model-pill__option--active" : ""}`}
                  onClick={() => {
                    onChange({ provider: { ...config.provider, model: m.value } });
                    setOpen(false);
                  }}
                >
                  <span className="blink-model-pill__option-label">{m.label}</span>
                  <span className="blink-model-pill__option-desc">{m.description}</span>
                </button>
              ))}
            </>
          )}

          {/* Static model list for codex */}
          {ptype === "codex" && (
            <>
              {CODEX_MODELS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`blink-model-pill__option blink-model-pill__option--with-desc${m.value === currentModel ? " blink-model-pill__option--active" : ""}`}
                  onClick={() => {
                    onChange({ provider: { ...config.provider, model: m.value } });
                    setOpen(false);
                  }}
                >
                  <span className="blink-model-pill__option-label">{m.label}</span>
                  <span className="blink-model-pill__option-desc">{m.description}</span>
                </button>
              ))}
              <div className="blink-model-pill__divider" />
              <div className="blink-model-pill__section-label">Effort</div>
              {CODEX_EFFORT_LEVELS.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  className={`blink-model-pill__option${currentEffort === e.value ? " blink-model-pill__option--active" : ""}`}
                  onClick={() => {
                    if (config.provider.type === "codex")
                      onChange({ provider: { ...config.provider, effort: e.value } });
                    setOpen(false);
                  }}
                >
                  {e.label}
                </button>
              ))}
            </>
          )}

          {/* Fetched models for openai-compat */}
          {ptype === "openai-compat" &&
            (fetchedModels.length > 0 ? (
              fetchedModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`blink-model-pill__option${m === currentModel ? " blink-model-pill__option--active" : ""}`}
                  onClick={() => {
                    onChange({ provider: { ...config.provider, model: m } });
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              ))
            ) : (
              <div className="blink-model-pill__empty">No models found</div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── ProviderSettings ──────────────────────────────────────────────────────────

function ProviderSettings({
  config,
  availableProviders,
  onChange,
  onClose,
}: {
  config: BlinkCodeConfig;
  availableProviders: string[];
  onChange: (p: Partial<BlinkCodeConfig>) => void;
  onClose: () => void;
}) {
  const ptype = config.provider.type;
  const isCLI = ptype === "claude-code" || ptype === "codex";

  // Derive active preset from current config type
  const activePreset =
    ptype === "anthropic"
      ? "anthropic"
      : ptype === "claude-code"
        ? "claude-code"
        : ptype === "codex"
          ? "codex"
          : ptype === "openai-compat" && config.provider.baseUrl === "http://localhost:11434/v1"
            ? "ollama"
            : "custom";

  // Live Ollama / openai-compat model list
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const baseUrl = ptype === "openai-compat" ? (config.provider.baseUrl ?? "") : null;

  useEffect(() => {
    if (!baseUrl) {
      setAvailableModels([]);
      return;
    }
    const apiKey =
      config.provider.type === "openai-compat" ? (config.provider.apiKey ?? "ollama") : "ollama";
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.json())
      .then((data: { data?: Array<{ id: string }> }) => {
        const models = (data.data ?? []).map((m) => m.id).sort();
        setAvailableModels(models);
        // Auto-select first model when field is blank (e.g. fresh Ollama preset)
        if (
          models.length > 0 &&
          config.provider.type === "openai-compat" &&
          !config.provider.model
        ) {
          onChange({ provider: { ...config.provider, model: models[0] } });
        }
      })
      .catch(() => setAvailableModels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  function applyPreset(value: string) {
    if (value === "custom") return; // let user keep current config and manually edit
    onChange({ provider: presetToConfig(value) });
  }

  // Visible presets: always show ollama + anthropic + custom, CLI options only if installed
  const visiblePresets = PRESETS.filter(
    (p) =>
      p.value === "ollama" ||
      p.value === "anthropic" ||
      p.value === "custom" ||
      availableProviders.includes(p.value),
  );

  const currentModel =
    ptype === "claude-code"
      ? (config.provider.model ?? "")
      : ptype === "codex"
        ? (config.provider.model ?? "")
        : ptype === "openai-compat"
          ? config.provider.model
          : "";

  return (
    <div className="blink-settings-panel">
      <div className="blink-settings-panel__header">
        <button type="button" className="blink-settings-panel__back" onClick={onClose}>
          <X size={14} /> Done
        </button>
        <span className="blink-settings-panel__title">Provider Settings</span>
      </div>
      <div className="blink-settings-panel__body">
        {/* Provider card */}
        <div className="blink-settings-panel__card">
          {/* Preset picker */}
          <div className="blink-settings-panel__field">
            <label>Preset</label>
            <select value={activePreset} onChange={(e) => applyPreset(e.target.value)}>
              {visiblePresets.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="blink-settings-panel__field">
            <label>Model</label>
            {ptype === "anthropic" ? (
              <select
                value={config.provider.model}
                onChange={(e) =>
                  onChange({ provider: { ...config.provider, model: e.target.value } })
                }
              >
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            ) : ptype === "claude-code" ? (
              <select
                value={currentModel}
                onChange={(e) =>
                  onChange({ provider: { ...config.provider, model: e.target.value } })
                }
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            ) : ptype === "codex" ? (
              <select
                value={currentModel}
                onChange={(e) =>
                  onChange({ provider: { ...config.provider, model: e.target.value } })
                }
              >
                {CODEX_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            ) : availableModels.length > 0 ? (
              <select
                value={currentModel}
                onChange={(e) =>
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
                  onChange({ provider: { ...config.provider, model: e.target.value } })
                }
                placeholder="e.g. llama3.2 or gpt-4o"
              />
            )}
          </div>
        </div>

        {/* Anthropic card — API key + thinking */}
        {ptype === "anthropic" && (
          <div className="blink-settings-panel__card">
            <div className="blink-settings-panel__field">
              <label>API Key</label>
              <input
                type="password"
                value={config.provider.apiKey}
                onChange={(e) => {
                  if (config.provider.type !== "anthropic") return;
                  onChange({ provider: { ...config.provider, apiKey: e.target.value } });
                }}
                placeholder="sk-ant-…"
              />
            </div>
            <div className="blink-settings-panel__field blink-settings-panel__field--row">
              <label>Extended thinking</label>
              <button
                type="button"
                className={`toggle ${config.provider.thinking ? "toggle--on" : ""}`}
                onClick={() => {
                  if (config.provider.type !== "anthropic") return;
                  onChange({ provider: { ...config.provider, thinking: !config.provider.thinking } });
                }}
              >
                <span className="toggle__thumb" />
              </button>
            </div>
            {config.provider.thinking && (
              <div className="blink-settings-panel__field">
                <label>Thinking budget (tokens)</label>
                <input
                  type="number"
                  min={1024}
                  max={100000}
                  step={1000}
                  value={config.provider.thinkingBudget}
                  onChange={(e) => {
                    if (config.provider.type !== "anthropic") return;
                    const v = Math.max(1024, parseInt(e.target.value, 10) || 10000);
                    onChange({ provider: { ...config.provider, thinkingBudget: v } });
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Connection card — only for openai-compat */}
        {ptype === "openai-compat" && (
          <div className="blink-settings-panel__card">
            <div className="blink-settings-panel__field">
              <label>Base URL</label>
              <input
                value={config.provider.baseUrl ?? ""}
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
                value={config.provider.apiKey ?? ""}
                onChange={(e) => {
                  if (config.provider.type !== "openai-compat") return;
                  onChange({ provider: { ...config.provider, apiKey: e.target.value } });
                }}
                placeholder="sk-… (leave empty for Ollama)"
              />
            </div>
          </div>
        )}

        {/* CLI notice */}
        {isCLI && (
          <p className="blink-settings-panel__notice">
            Uses your locally installed <code>{ptype === "claude-code" ? "claude" : "codex"}</code>{" "}
            CLI. Authentication is managed by the CLI itself.
          </p>
        )}

        {/* Permission toggle — not relevant for CLI providers */}
        {!isCLI && (
          <div className="blink-settings-panel__card">
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
          </div>
        )}
      </div>
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
            return (
              <pre className="blink-msg__code-block">
                <code className={className}>{children}</code>
              </pre>
            );
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
