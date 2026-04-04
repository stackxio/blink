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

type DisplayToolCall = { id: string; name: string; result?: string; is_error?: boolean };
type HistoryDisplayMessage =
  | { role: "user"; id: string; content: string }
  | { role: "assistant"; id: string; content: string; toolCalls: DisplayToolCall[] };

type BridgeOutEvent =
  | { type: "text_delta"; assistantMsgId: string; delta: string }
  | { type: "tool_call_start"; assistantMsgId: string; callId: string; name: string }
  | {
      type: "tool_call_result";
      assistantMsgId: string;
      callId: string;
      result: string;
      is_error: boolean;
    }
  | { type: "turn_done"; assistantMsgId: string }
  | {
      type: "bridge_ready";
      resumed?: boolean;
      messageCount?: number;
      availableProviders?: string[];
    }
  | { type: "history"; messages: HistoryDisplayMessage[] }
  | { type: "permission_request"; reqId: string; toolName: string; input: Record<string, unknown> }
  | { type: "error"; error: string; assistantMsgId?: string };

// ── Provider preset options ───────────────────────────────────────────────────

const PRESETS = [
  { label: "Ollama (local)", value: "ollama" },
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Custom…", value: "custom" },
];

const CLAUDE_MODELS = [
  { label: "Claude Opus 4.5", value: "claude-opus-4-5" },
  { label: "Claude Sonnet 4.5", value: "claude-sonnet-4-5" },
  { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
];

const CODEX_MODELS = [
  { label: "codex-mini-latest", value: "codex-mini-latest" },
  { label: "o3", value: "o3" },
  { label: "o4-mini", value: "o4-mini" },
  { label: "GPT-4o", value: "gpt-4o" },
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
    case "claude-code":
      return { type: "claude-code", model: CLAUDE_MODELS[0].value };
    case "codex":
      return { type: "codex", model: CODEX_MODELS[0].value };
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

  const [bridgeReady, setBridgeReady] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<string[]>(["ollama", "custom"]);
  const bridgeReadyRef = useRef(false);
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

    const userMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: text }]);

    const assistantMsgId = crypto.randomUUID();
    currentAssistantMsgIdRef.current = assistantMsgId;
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", toolCalls: [], streaming: true },
    ]);
    setStreaming(true);
    await invoke("blink_code_bridge_send", {
      line: JSON.stringify({ type: "chat", assistantMsgId, text }),
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
                <ModelPill config={config} onChange={handleConfigChange} />
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
      {msg.toolCalls.map((tc) => (
        <ToolCallRow key={tc.id} call={tc} onToggle={() => onToggleTool(tc.id)} />
      ))}
      {msg.content && (
        <div className="blink-msg__text">
          <MarkdownText text={msg.content} />
          {msg.streaming && <span className="blink-msg__cursor" />}
        </div>
      )}
      {msg.streaming && !msg.content && !msg.toolCalls.length && (
        <div className="blink-msg__thinking">
          <span className="blink-msg__dot" />
          <span className="blink-msg__dot" />
          <span className="blink-msg__dot" />
        </div>
      )}
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

// ── ModelPill ─────────────────────────────────────────────────────────────────

function ModelPill({
  config,
  onChange,
}: {
  config: BlinkCodeConfig;
  onChange: (p: Partial<BlinkCodeConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const baseUrl =
    config.provider.type === "openai-compat"
      ? (config.provider.baseUrl ?? "http://localhost:11434/v1")
      : null;

  useEffect(() => {
    if (!open || !baseUrl) return;
    const apiKey =
      config.provider.type === "openai-compat" ? (config.provider.apiKey ?? "ollama") : "ollama";
    fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then((r) => r.json())
      .then((d: { data?: Array<{ id: string }> }) =>
        setModels((d.data ?? []).map((m) => m.id).sort()),
      )
      .catch(() => setModels([]));
  }, [open, baseUrl, config.provider.type === "openai-compat" ? config.provider.apiKey : ""]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="blink-model-pill" ref={ref}>
      <button type="button" className="blink-model-pill__btn" onClick={() => setOpen((v) => !v)}>
        <span className="blink-model-pill__name">
          {config.provider.type === "claude-code"
            ? `claude · ${config.provider.model ?? "default"}`
            : config.provider.type === "codex"
              ? `codex · ${config.provider.model ?? "default"}`
              : config.provider.model || "—"}
        </span>
        <ChevronRight
          size={10}
          className={`blink-model-pill__chevron${open ? " blink-model-pill__chevron--open" : ""}`}
        />
      </button>
      {open && config.provider.type === "openai-compat" && (
        <div className="blink-model-pill__dropdown">
          {models.length > 0 ? (
            models.map((m) => (
              <button
                key={m}
                type="button"
                className={`blink-model-pill__option${m === config.provider.model ? " blink-model-pill__option--active" : ""}`}
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
          )}
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
    ptype === "claude-code"
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

  // Visible presets: always show ollama + custom, show CLI options only if installed
  const visiblePresets = PRESETS.filter(
    (p) => p.value === "ollama" || p.value === "custom" || availableProviders.includes(p.value),
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
          {ptype === "claude-code" ? (
            <select
              value={currentModel}
              onChange={(e) =>
                onChange({ provider: { ...config.provider, model: e.target.value } })
              }
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
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
                  {m.label}
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

        {/* Base URL — only for openai-compat */}
        {ptype === "openai-compat" && (
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
        )}

        {/* API Key — only for openai-compat */}
        {ptype === "openai-compat" && (
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
          <div className="blink-settings-panel__field blink-settings-panel__field--row">
            <label>Require permission for tools</label>
            <input
              type="checkbox"
              checked={config.requirePermission}
              onChange={(e) => onChange({ requirePermission: e.target.checked })}
            />
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
