import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowUp, Square, ChevronDown, FileCode, Folder, SquarePen, X, MessageSquare, Pencil, Archive, Trash2 } from "lucide-react";
import MessageBubble, { type Message, type Activity } from "./MessageBubble";
import { useAppStore } from "@/store";

interface DbMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface DbThread {
  id: string;
  folder_id: string | null;
  title: string;
  root_path_override: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface AiThread {
  id: string;
  title: string;
  createdAt: Date;
}

type ReasoningEffort = "xhigh" | "high" | "medium" | "low";
const REASONING_LABELS: Record<ReasoningEffort, string> = {
  xhigh: "Extra High", high: "High", medium: "Medium", low: "Low",
};

interface ModelOption { slug: string; label: string }
const GPT_MODELS: ModelOption[] = [
  { slug: "gpt-5.4", label: "GPT-5.4" },
  { slug: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { slug: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
];
const CLAUDE_MODELS: ModelOption[] = [
  { slug: "sonnet", label: "Sonnet" },
  { slug: "opus", label: "Opus" },
  { slug: "haiku", label: "Haiku" },
];

export default function AiPanel() {
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [activeProvider, setActiveProvider] = useState("codex");
  const [gptModel, setGptModel] = useState("gpt-5.4");
  const [claudeModel, setClaudeModel] = useState("sonnet");
  const [ollamaModel, setOllamaModel] = useState("llama3");
  const [ollamaModels, setOllamaModels] = useState<{ name: string }[]>([]);
  const [composerReasoning, setComposerReasoning] = useState<ReasoningEffort>("high");
  const [contextFiles, setContextFiles] = useState<string[]>([]); // paths attached via @
  const [atMenuOpen, setAtMenuOpen] = useState(false);
  const [atQuery, setAtQuery] = useState("");
  const [atResults, setAtResults] = useState<string[]>([]);
  const [atSelectedIdx, setAtSelectedIdx] = useState(0);
  const atMenuRef = useRef<HTMLDivElement>(null);

  const [threadDropdownOpen, setThreadDropdownOpen] = useState(false);
  const threadDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const streamingThreadIdRef = useRef<string | null>(null);

  const ws = useAppStore((s) => s.activeWorkspace());
  const activeFile = ws && ws.activeFileIdx >= 0 ? ws.openFiles[ws.activeFileIdx] : null;

  // Close thread dropdown on outside click
  useEffect(() => {
    if (!threadDropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (threadDropdownRef.current && !threadDropdownRef.current.contains(e.target as Node)) setThreadDropdownOpen(false);
    }
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => document.removeEventListener("mousedown", onClick);
  }, [threadDropdownOpen]);

  // Load settings
  useEffect(() => {
    invoke<Record<string, unknown>>("get_settings").then((s) => {
      if (s.active_provider) setActiveProvider(s.active_provider as string);
      const ollama = s.ollama as Record<string, unknown> | undefined;
      if (ollama?.model) setOllamaModel(ollama.model as string);
      const codex = s.codex as Record<string, unknown> | undefined;
      if (codex?.model) setGptModel(codex.model as string);
    }).catch(() => {});
  }, []);

  // Load Ollama models on mount (always, so they show in the dropdown)
  useEffect(() => {
    invoke<{ name: string }[]>("list_ollama_models").then((models) => {
      setOllamaModels(models);
      if (models.length > 0) {
        setOllamaModel((prev) => models.some((m) => m.name === prev) ? prev : models[0].name);
      }
    }).catch(() => {});
  }, []);

  // Reset on workspace switch — cancel active stream and clear all state
  useEffect(() => {
    if (sessionIdRef.current) {
      invoke("cancel_stream", { sessionId: sessionIdRef.current }).catch(() => {});
    }
    setActiveThreadId(null);
    setMessages([]);
    setIsLoading(false);
    setQueue([]);
    setContextFiles([]);
    sessionIdRef.current = null;
    streamingThreadIdRef.current = null;
  }, [ws?.path]);

  // Load threads filtered by workspace
  useEffect(() => {
    invoke<DbThread[]>("list_threads").then((dbThreads) => {
      const wsPath = ws?.path ?? null;
      const filtered = wsPath
        ? dbThreads.filter((t) => t.root_path_override === wsPath || t.root_path_override === null)
        : dbThreads;
      setThreads(filtered.map((t) => ({ id: t.id, title: t.title, createdAt: new Date(t.created_at) })));
    }).catch(() => {});
  }, [ws?.path]);

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThreadId) { setMessages([]); return; }
    if (streamingThreadIdRef.current === activeThreadId) return;
    invoke<DbMessage[]>("list_messages", { threadId: activeThreadId }).then((dbMsgs) => {
      setMessages(dbMsgs.map((m) => ({
        id: m.id, role: m.role, content: m.content, timestamp: new Date(m.created_at),
      })));
    }).catch(() => setMessages([]));
  }, [activeThreadId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Draft auto-save
  useEffect(() => {
    const key = `caret:ai-draft:${activeThreadId ?? "new"}`;
    if (input) localStorage.setItem(key, input);
    else localStorage.removeItem(key);
  }, [input, activeThreadId]);

  // Restore draft on thread switch
  useEffect(() => {
    const saved = localStorage.getItem(`caret:ai-draft:${activeThreadId ?? "new"}`);
    setInput(saved ?? "");
  }, [activeThreadId]);

  async function createThread(): Promise<string> {
    const dbThread = await invoke<DbThread>("create_thread", {
      folderId: null, title: "New chat", scopeModeOverride: null, rootPathOverride: ws?.path ?? null,
    });
    const thread: AiThread = { id: dbThread.id, title: dbThread.title, createdAt: new Date(dbThread.created_at) };
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    return thread.id;
  }

  async function sendMessage(text: string, tid: string) {
    streamingThreadIdRef.current = tid;

    // Auto-title on first message
    if (messages.length === 0) {
      const title = text.length > 40 ? text.slice(0, 40) + "..." : text;
      setThreads((prev) => prev.map((t) => t.id === tid ? { ...t, title } : t));
      invoke("update_thread_title", { id: tid, title }).catch(() => {});
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Save to DB
    invoke("send_message", { threadId: tid, role: "user", content: text }).catch(() => {});

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date(), isStreaming: true }]);

    const unlistenChunk = await listen<{ chunk: string }>("chat:stream", (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + e.payload.chunk } : m));
    });

    const unlistenActivity = await listen<{ activity: Activity }>("chat:activity", (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, activities: [...(m.activities || []), e.payload.activity] } : m));
    });

    const unlistenDone = await listen<{ full_text: string }>("chat:done", async (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: e.payload.full_text, isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
      invoke("send_message", { threadId: tid, role: "assistant", content: e.payload.full_text }).catch(() => {});
      // Process queue
      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        setTimeout(() => sendMessage(next, tid), 0);
        return rest;
      });
    });

    const unlistenError = await listen<{ error: string }>("chat:error", (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${e.payload.error}`, isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
    });

    const unlistenCancelled = await listen<{ partial_text: string }>("chat:cancelled", async (e) => {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: e.payload.partial_text || "*(cancelled)*", isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
      if (e.payload.partial_text) {
        invoke("send_message", { threadId: tid, role: "assistant", content: e.payload.partial_text }).catch(() => {});
      }
    });

    function cleanup() { unlistenChunk(); unlistenActivity(); unlistenDone(); unlistenError(); unlistenCancelled(); }

    try {
      const currentModel = activeProvider === "codex" ? gptModel
        : activeProvider === "claude_code" ? claudeModel
        : activeProvider === "ollama" ? ollamaModel : "default";

      // Inject workspace context + @-mentioned files
      let contextParts: string[] = [];
      if (ws?.path) {
        contextParts.push(`[Workspace: ${ws.path}]`);
      }
      // Read all @-attached files/folders
      for (const filePath of contextFiles) {
        try {
          const fileContent = await invoke<string>("read_file_content", { path: filePath });
          if (fileContent.length < 10000) {
            contextParts.push(`[File: ${filePath}]\n\`\`\`\n${fileContent}\n\`\`\``);
          } else {
            contextParts.push(`[File: ${filePath} (truncated)]\n\`\`\`\n${fileContent.slice(0, 8000)}\n...(truncated)\n\`\`\``);
          }
        } catch {
          // Might be a folder — list its contents
          try {
            const entries = await invoke<{ name: string; is_dir: boolean }[]>("read_dir", { path: filePath });
            const listing = entries.map((e) => `${e.is_dir ? "📁" : "📄"} ${e.name}`).join("\n");
            contextParts.push(`[Folder: ${filePath}]\n${listing}`);
          } catch {}
        }
      }
      const enrichedPrompt = contextParts.length > 0
        ? `${contextParts.join("\n\n")}\n\n${text}`
        : text;

      const sid = await invoke<string>("chat_stream", {
        input: {
          prompt: enrichedPrompt,
          threadId: tid,
          runtimeMode: "full-access",
          provider: activeProvider,
          model: currentModel,
        },
      });
      sessionIdRef.current = sid;
    } catch (err: unknown) {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${err instanceof Error ? err.message : String(err)}`, isStreaming: false } : m));
      setIsLoading(false);
      sessionIdRef.current = null;
      streamingThreadIdRef.current = null;
      cleanup();
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    localStorage.removeItem(`caret:ai-draft:${activeThreadId ?? "new"}`);

    if (isLoading && activeThreadId) {
      setQueue((prev) => [...prev, text]);
      return;
    }

    let tid = activeThreadId;
    if (!tid) {
      tid = await createThread();
    }
    await sendMessage(text, tid);
  }

  async function handleCancel() {
    if (!sessionIdRef.current) return;
    setQueue([]);
    invoke("cancel_stream", { sessionId: sessionIdRef.current }).catch(() => {});
  }

  function handleNewChat() {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setQueue([]);
    setContextFiles([]);
  }

  async function handleArchiveThread(id: string) {
    try {
      await invoke("archive_thread", { id });
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) handleNewChat();
    } catch {}
  }

  async function handleDeleteThread(id: string) {
    try {
      await invoke("delete_thread", { id });
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) handleNewChat();
    } catch {}
  }

  async function handleRenameThread(id: string) {
    const thread = threads.find((t) => t.id === id);
    if (!thread) return;
    const newTitle = prompt("Rename chat:", thread.title);
    if (!newTitle || !newTitle.trim()) return;
    try {
      await invoke("update_thread_title", { id, title: newTitle.trim() });
      setThreads((prev) => prev.map((t) => t.id === id ? { ...t, title: newTitle.trim() } : t));
    } catch {}
  }

  // @ mention file/folder search
  useEffect(() => {
    if (!atMenuOpen || !ws?.path) {
      setAtResults([]);
      return;
    }
    const q = atQuery.toLowerCase();

    // Handle @active / @current — auto-select the active file
    if (q === "active" || q === "current") {
      if (activeFile) {
        const relPath = activeFile.path.startsWith(ws.path + "/")
          ? activeFile.path.slice(ws.path.length + 1)
          : activeFile.name;
        setAtResults([relPath]);
        setAtSelectedIdx(0);
      } else {
        setAtResults([]);
      }
      return;
    }

    const timer = setTimeout(() => {
      // Get both files and top-level folders
      Promise.all([
        invoke<string[]>("list_all_files", { root: ws.path, maxFiles: 5000 }),
        invoke<{ name: string; path: string; is_dir: boolean }[]>("read_dir", { path: ws.path }),
      ]).then(([files, dirEntries]) => {
        // Add folders (prefixed with / to distinguish)
        const folders = dirEntries
          .filter((e) => e.is_dir)
          .map((e) => e.name + "/");

        const all = [...folders, ...files];

        // Get relative paths of open files for prioritization
        const openRelPaths = (ws.openFiles || []).map((f) =>
          f.path.startsWith(ws.path + "/") ? f.path.slice(ws.path!.length + 1) : f.name,
        );

        if (q) {
          const filtered = all.filter((f) => f.toLowerCase().includes(q)).slice(0, 12);
          setAtResults(filtered);
        } else {
          // No query: show open files first, then workspace files
          const openSet = new Set(openRelPaths);
          const rest = all.filter((f) => !openSet.has(f));
          const combined = [...openRelPaths, ...rest].slice(0, 12);
          setAtResults(combined);
        }
        setAtSelectedIdx(0);
      }).catch(() => setAtResults([]));
    }, atQuery ? 150 : 0); // instant for empty query, debounced for typing
    return () => clearTimeout(timer);
  }, [atQuery, atMenuOpen, ws?.path]);

  // Close @ menu on outside click
  useEffect(() => {
    if (!atMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (atMenuRef.current && !atMenuRef.current.contains(e.target as Node)) setAtMenuOpen(false);
    }
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => document.removeEventListener("mousedown", onClick);
  }, [atMenuOpen]);

  function handleAtSelect(filePath: string) {
    const isFolder = filePath.endsWith("/");
    const fullPath = `${ws?.path}/${isFolder ? filePath.slice(0, -1) : filePath}`;
    if (!contextFiles.includes(fullPath)) {
      setContextFiles((prev) => [...prev, fullPath]);
    }
    // Remove the @query from input
    setInput((prev) => {
      const atIdx = prev.lastIndexOf("@");
      return atIdx >= 0 ? prev.slice(0, atIdx) : prev;
    });
    setAtMenuOpen(false);
    setAtQuery("");
    textareaRef.current?.focus();
  }

  function removeContextFile(path: string) {
    setContextFiles((prev) => prev.filter((f) => f !== path));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Handle @ menu navigation
    if (atMenuOpen && atResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAtSelectedIdx((i) => Math.min(i + 1, atResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAtSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleAtSelect(atResults[atSelectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        setAtMenuOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const recentThreads = threads.slice(0, 20);

  return (
    <div className="ai-panel">
      {/* Header with thread selector */}
      <div className="ai-panel__header">
        <div className="ai-panel__thread-picker" ref={threadDropdownRef}>
          <button
            type="button"
            className="ai-panel__thread-btn"
            onClick={() => setThreadDropdownOpen((v) => !v)}
          >
            <MessageSquare size={13} />
            <span>{activeThreadId ? (threads.find((t) => t.id === activeThreadId)?.title ?? "Chat") : "New Chat"}</span>
            <ChevronDown size={12} />
          </button>
          {threadDropdownOpen && (
            <div className="ai-panel__thread-dropdown">
              <button
                type="button"
                className="ai-panel__thread-option ai-panel__thread-option--new"
                onClick={() => { handleNewChat(); setThreadDropdownOpen(false); }}
              >
                <SquarePen size={13} />
                New Chat
              </button>
              {recentThreads.length > 0 && <div className="ai-panel__thread-sep" />}
              {recentThreads.map((t) => (
                <div key={t.id} className={`ai-panel__thread-option ${t.id === activeThreadId ? "ai-panel__thread-option--active" : ""}`}>
                  <button
                    type="button"
                    className="ai-panel__thread-option-label"
                    onClick={() => { setActiveThreadId(t.id); setThreadDropdownOpen(false); }}
                  >
                    {t.title}
                  </button>
                  <div className="ai-panel__thread-option-actions">
                    <button type="button" title="Rename" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setThreadDropdownOpen(false); setTimeout(() => handleRenameThread(t.id), 100); }}>
                      <Pencil size={11} />
                    </button>
                    <button type="button" title="Archive" onClick={(e) => { e.stopPropagation(); handleArchiveThread(t.id); }}>
                      <Archive size={11} />
                    </button>
                    <button type="button" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteThread(t.id); }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* Messages */}
      <div className="ai-panel__messages">
        {messages.length === 0 ? (
          <div className="ai-panel__empty">
            <p>Start a conversation with AI.</p>
            <p>It can see your active file and workspace.</p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        {/* Queued messages */}
        {queue.map((text, i) => (
          <div key={`q-${i}`} className="chat-msg__queued">
            <span>{text}</span>
            <button type="button" onClick={() => setQueue((prev) => prev.filter((_, j) => j !== i))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="ai-panel__input-area">
        {/* Context files chips */}
        {contextFiles.length > 0 && (
          <div className="ai-panel__context-files">
            {contextFiles.map((f) => (
              <span key={f} className="ai-panel__context-chip">
                {f.split("/").pop()}
                <button type="button" onClick={() => removeContextFile(f)}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="ai-panel__input-wrapper" style={{ position: "relative" }}>
          {/* @ file picker */}
          {atMenuOpen && atResults.length > 0 && (
            <div ref={atMenuRef} className="ai-panel__at-menu">
              {atResults.map((file, i) => (
                <button
                  key={file}
                  type="button"
                  className={`ai-panel__at-item ${i === atSelectedIdx ? "ai-panel__at-item--active" : ""}`}
                  onClick={() => handleAtSelect(file)}
                  onMouseMove={() => setAtSelectedIdx(i)}
                >
                  {file.endsWith("/") ? <Folder size={13} /> : <FileCode size={13} />}
                  <span className="ai-panel__at-name">{file.endsWith("/") ? file.slice(0, -1) : file.split("/").pop()}</span>
                  {!file.endsWith("/") && <span className="ai-panel__at-path">{file}</span>}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
              // Detect @ for file mention
              const atIdx = val.lastIndexOf("@");
              if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === " " || val[atIdx - 1] === "\n")) {
                const query = val.slice(atIdx + 1);
                if (!query.includes(" ") && !query.includes("\n")) {
                  setAtMenuOpen(true);
                  setAtQuery(query);
                } else {
                  setAtMenuOpen(false);
                }
              } else {
                setAtMenuOpen(false);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "Type to queue follow-up…" : "Ask about your code…"}
            rows={1}
            className="ai-panel__textarea"
          />
          {isLoading ? (
            <button type="button" className="ai-panel__stop" onClick={handleCancel}>
              <Square size={10} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="ai-panel__send" onClick={handleSend} disabled={!input.trim()}>
              <ArrowUp size={14} />
            </button>
          )}
        </div>
        {/* Model selector — single clean row */}
        <div className="ai-panel__model-bar">
          <select
            className="ai-panel__model-select"
            value={`${activeProvider}:${activeProvider === "codex" ? gptModel : activeProvider === "claude_code" ? claudeModel : activeProvider === "ollama" ? ollamaModel : "default"}`}
            onChange={async (e) => {
              const [provider, ...modelParts] = e.target.value.split(":");
              const model = modelParts.join(":"); // handle model names with colons like "qwen3:0.6b"
              setActiveProvider(provider);
              if (provider === "codex") setGptModel(model);
              else if (provider === "claude_code") setClaudeModel(model);
              else if (provider === "ollama") setOllamaModel(model);
              // Save to settings so backend uses the new provider/model
              try {
                const s = await invoke<Record<string, unknown>>("get_settings");
                const updated: Record<string, unknown> = { ...s, active_provider: provider };
                if (provider === "codex") updated.codex = { ...(s.codex as Record<string, unknown> ?? {}), model };
                if (provider === "claude_code") updated.claude_code = { ...(s.claude_code as Record<string, unknown> ?? {}), model };
                if (provider === "ollama") updated.ollama = { ...(s.ollama as Record<string, unknown> ?? {}), model };
                await invoke("save_settings", { settings: updated });
              } catch {}
            }}
          >
            <optgroup label="GPT">
              {GPT_MODELS.map((m) => <option key={m.slug} value={`codex:${m.slug}`}>{m.label}</option>)}
            </optgroup>
            <optgroup label="Claude">
              {CLAUDE_MODELS.map((m) => <option key={m.slug} value={`claude_code:${m.slug}`}>{m.label}</option>)}
            </optgroup>
            {ollamaModels.length > 0 && (
              <optgroup label="Ollama">
                {ollamaModels.map((m) => <option key={m.name} value={`ollama:${m.name}`}>{m.name}</option>)}
              </optgroup>
            )}
            <optgroup label="Other">
              <option value="custom:default">Custom API</option>
            </optgroup>
          </select>
        </div>
      </div>
    </div>
  );
}
