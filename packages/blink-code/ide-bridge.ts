import * as readline from "node:readline";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";

import { createProvider } from "./panel/providers";
import { BlinkEngine } from "./panel/engine";
import { detectClaude } from "./panel/providers/claude/detector";
import { detectCodex } from "./panel/providers/codex/detector";
import type { ProviderConfig } from "./panel/config";
import type { BlinkMessage, BlinkToolCall } from "./panel/providers/types";

type ProviderBundle = {
  provider: ProviderConfig;
  maxTurns: number;
  requirePermission: boolean;
  systemPrompt: string;
  allowTools: boolean;
  persistSession: boolean;
};

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
};

function out(obj: unknown) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function send(type: string, payload: Record<string, unknown>) {
  out({ type, ...payload });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

const pendingPermissions = new Map<string, (allowed: boolean) => void>();

let engine: BlinkEngine | null = null;
let providerBundle: ProviderBundle | null = null;

let currentAssistantMsgId: string | null = null;
let chatInProgress = false;

// ── Thread + session persistence ─────────────────────────────────────────────

type SessionData = {
  messages: BlinkMessage[];
  cliSessionIds: Record<string, string>;
};

type ThreadMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

type ThreadsIndex = {
  activeThreadId: string;
  threads: ThreadMeta[];
};

// Module-level thread state
let threadsDir: string | null = null;
let currentThreadId: string | null = null;
let threadsIndex: ThreadsIndex = { activeThreadId: "", threads: [] };

function workspaceHash(workspacePath: string): string {
  return workspacePath.replace(/[^a-zA-Z0-9]/g, "_").slice(-60);
}

function workspaceThreadsDir(workspacePath: string): string {
  const hash = workspaceHash(workspacePath);
  return path.join(os.homedir(), ".blink", "sessions", hash, "threads");
}

function threadFilePath(id: string): string {
  return path.join(threadsDir!, `${id}.json`);
}

function indexFilePath(): string {
  return path.join(threadsDir!, "index.json");
}

async function loadThreadsIndex(): Promise<ThreadsIndex> {
  try {
    const raw = await fs.readFile(indexFilePath(), "utf-8");
    return JSON.parse(raw) as ThreadsIndex;
  } catch {
    return { activeThreadId: "", threads: [] };
  }
}

async function saveThreadsIndex(): Promise<void> {
  try {
    await fs.mkdir(threadsDir!, { recursive: true });
    await fs.writeFile(indexFilePath(), JSON.stringify(threadsIndex, null, 2), "utf-8");
  } catch {}
}

async function loadThreadData(id: string): Promise<SessionData> {
  try {
    const raw = await fs.readFile(threadFilePath(id), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SessionData> | BlinkMessage[];
    if (Array.isArray(parsed)) return { messages: parsed, cliSessionIds: {} };
    return { messages: parsed.messages ?? [], cliSessionIds: parsed.cliSessionIds ?? {} };
  } catch {
    return { messages: [], cliSessionIds: {} };
  }
}

async function saveThreadData(id: string, data: SessionData): Promise<void> {
  try {
    await fs.mkdir(threadsDir!, { recursive: true });
    await fs.writeFile(threadFilePath(id), JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

function createThreadMeta(name = "New conversation"): ThreadMeta {
  const now = Date.now();
  return { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, messageCount: 0 };
}

/** Auto-name a thread from its first user message (max 50 chars). */
function autoThreadName(messages: BlinkMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first || typeof first.content !== "string") return "New conversation";
  const text = first.content.replace(/\s+/g, " ").trim();
  return text.length > 50 ? text.slice(0, 47) + "…" : text;
}

/** Initialize thread storage for a workspace, migrating legacy history.json if present. */
async function initThreads(workspacePath: string): Promise<void> {
  threadsDir = workspaceThreadsDir(workspacePath);
  await fs.mkdir(threadsDir, { recursive: true });

  threadsIndex = await loadThreadsIndex();

  // Migrate legacy history.json → first thread
  if (threadsIndex.threads.length === 0) {
    const legacyFile = path.join(
      os.homedir(),
      ".blink",
      "sessions",
      workspaceHash(workspacePath),
      "history.json",
    );
    let legacyData: SessionData = { messages: [], cliSessionIds: {} };
    try {
      const raw = await fs.readFile(legacyFile, "utf-8");
      const parsed = JSON.parse(raw) as Partial<SessionData> | BlinkMessage[];
      if (Array.isArray(parsed)) {
        legacyData = { messages: parsed, cliSessionIds: {} };
      } else {
        legacyData = { messages: parsed.messages ?? [], cliSessionIds: parsed.cliSessionIds ?? {} };
      }
    } catch {}

    const meta = createThreadMeta(
      legacyData.messages.length > 0 ? autoThreadName(legacyData.messages) : "New conversation",
    );
    meta.messageCount = legacyData.messages.length;
    if (legacyData.messages.length > 0) {
      meta.updatedAt = Date.now();
    }
    threadsIndex = { activeThreadId: meta.id, threads: [meta] };
    await saveThreadData(meta.id, legacyData);
    await saveThreadsIndex();
  }

  // Ensure active thread still exists
  const activeExists = threadsIndex.threads.some((t) => t.id === threadsIndex.activeThreadId);
  if (!activeExists && threadsIndex.threads.length > 0) {
    threadsIndex.activeThreadId = threadsIndex.threads[0].id;
    await saveThreadsIndex();
  }
  if (threadsIndex.threads.length === 0) {
    const meta = createThreadMeta();
    threadsIndex = { activeThreadId: meta.id, threads: [meta] };
    await saveThreadData(meta.id, { messages: [], cliSessionIds: {} });
    await saveThreadsIndex();
  }

  currentThreadId = threadsIndex.activeThreadId;
}

/** Save current thread state, update metadata, persist index. */
async function persistCurrentThread(): Promise<void> {
  if (!currentThreadId || !engine) return;
  const data: SessionData = { messages: engine.messages, cliSessionIds };
  await saveThreadData(currentThreadId, data);

  const meta = threadsIndex.threads.find((t) => t.id === currentThreadId);
  if (meta) {
    meta.messageCount = data.messages.length;
    meta.updatedAt = Date.now();
    // Auto-name from first user message if still "New conversation"
    if (meta.name === "New conversation" && data.messages.length > 0) {
      meta.name = autoThreadName(data.messages);
    }
  }
  await saveThreadsIndex();
}

// In-memory CLI session IDs for the current thread
let cliSessionIds: Record<string, string> = {};

function getCliSessionId(key: string): string | null {
  return cliSessionIds[key] ?? null;
}

function saveCliSessionId(key: string, id: string): void {
  cliSessionIds[key] = id;
}

// ── CLI detection ────────────────────────────────────────────────────────────

async function detectAvailableProviders(): Promise<string[]> {
  const available = ["ollama", "custom"];
  const [hasClaude, hasCodex] = await Promise.all([detectClaude(), detectCodex()]);
  if (hasClaude) available.push("claude-code");
  if (hasCodex) available.push("codex");
  return available;
}

// ── Tool execution (runs directly in this Bun process) ───────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "read_file": {
      const filePath = input["path"] as string;
      const content = await fs.readFile(filePath, "utf-8");
      if (content.length > 50_000) {
        return `${content.slice(0, 50_000)}\n\n[File truncated — ${content.length} bytes total, showing first 50000]`;
      }
      return content;
    }

    case "write_file": {
      const filePath = input["path"] as string;
      const content = input["content"] as string;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return `Wrote ${content.length} bytes to ${filePath}`;
    }

    case "list_dir": {
      const dirPath = input["path"] as string;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      if (entries.length === 0) return "(empty directory)";
      return entries
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort()
        .join("\n");
    }

    case "run_command": {
      const cmd = input["command"] as string;
      const cwd = input["cwd"] as string | undefined;
      return new Promise((resolve) => {
        exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (_err, stdout, stderr) => {
          let result = "";
          if (stdout.trim()) result += stdout.trim();
          if (stderr.trim()) result += (result ? "\nstderr: " : "stderr: ") + stderr.trim();
          if (!result) result = "(no output)";
          if (result.length > 10_000) result = result.slice(0, 10_000) + "\n...[truncated]";
          resolve(result);
        });
      });
    }

    case "search_files": {
      const root = input["root"] as string;
      const pattern = input["pattern"] as string;
      return new Promise((resolve) => {
        exec(
          `grep -r -n -- ${JSON.stringify(pattern)} ${JSON.stringify(root)}`,
          { maxBuffer: 10 * 1024 * 1024 },
          (_err, stdout) => {
            const result = stdout.trim();
            if (!result) {
              resolve("No matches found");
              return;
            }
            resolve(result.slice(0, 5_000));
          },
        );
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function buildTools(): ToolDef[] {
  return [
    {
      name: "read_file",
      description: "Read the full contents of a file at the given path.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Absolute path to the file" } },
        required: ["path"],
      },
      execute: (input) => executeTool("read_file", input),
    },
    {
      name: "write_file",
      description: "Write content to a file, creating it if it does not exist.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
      execute: (input) => executeTool("write_file", input),
    },
    {
      name: "list_dir",
      description: "List files and directories in a directory.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Absolute path to the directory" } },
        required: ["path"],
      },
      execute: (input) => executeTool("list_dir", input),
    },
    {
      name: "run_command",
      description: "Run a shell command and return its stdout/stderr output.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["command"],
      },
      execute: (input) => executeTool("run_command", input),
    },
    {
      name: "search_files",
      description: "Search for a text pattern across files in a directory (grep-style).",
      parameters: {
        type: "object",
        properties: {
          root: { type: "string", description: "Root directory to search" },
          pattern: { type: "string", description: "Text or regex pattern to search for" },
        },
        required: ["root", "pattern"],
      },
      execute: (input) => executeTool("search_files", input),
    },
  ];
}

// ── Permission gating ────────────────────────────────────────────────────────

async function permissionRequest(
  toolName: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  const reqId = crypto.randomUUID();
  const p = new Promise<boolean>((resolve) => pendingPermissions.set(reqId, resolve));
  send("permission_request", { reqId, toolName, input });
  return p;
}

// ── Engine factory ───────────────────────────────────────────────────────────

function ensureEngine(): BlinkEngine {
  if (!providerBundle) {
    throw new Error("Bridge is not initialized. Send an init message first.");
  }

  const isCLIProvider =
    providerBundle.provider.type === "claude-code" || providerBundle.provider.type === "codex";

  const provider = createProvider(providerBundle.provider, {
    getSessionId: getCliSessionId,
    saveSessionId: saveCliSessionId,
  });

  // CLI providers manage their own tool loop — don't pass blink tools or do multi-turn
  const tools = isCLIProvider || !providerBundle.allowTools ? [] : buildTools();
  const maxTurns = isCLIProvider ? 1 : providerBundle.maxTurns;

  return new BlinkEngine({
    provider,
    tools,
    system: providerBundle.systemPrompt,
    maxTurns,
    onPermission:
      !isCLIProvider && providerBundle.requirePermission
        ? (toolName, toolInput) => permissionRequest(toolName, toolInput as Record<string, unknown>)
        : undefined,
  });
}

// ── Abort ────────────────────────────────────────────────────────────────────

async function handleAbort(assistantMsgId?: string | null) {
  if (assistantMsgId && currentAssistantMsgId && assistantMsgId !== currentAssistantMsgId) return;

  for (const [, resolve] of pendingPermissions) resolve(false);
  pendingPermissions.clear();

  engine?.abort();
  chatInProgress = false;
  if (currentAssistantMsgId) {
    send("turn_done", { assistantMsgId: currentAssistantMsgId });
  }
}

// ── History reconstruction for UI display ────────────────────────────────────

type DisplayToolCall = { id: string; name: string; result?: string; is_error?: boolean };
type DisplayMessage =
  | { role: "user"; id: string; content: string }
  | { role: "assistant"; id: string; content: string; toolCalls: DisplayToolCall[] };

function buildDisplayHistory(messages: BlinkMessage[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  const toolCallIndex = new Map<string, number>();

  for (const msg of messages) {
    if (msg.role === "user") {
      out.push({ role: "user", id: crypto.randomUUID(), content: String(msg.content) });
    } else if (msg.role === "assistant") {
      const toolCalls: DisplayToolCall[] = (msg.tool_calls ?? []).map((tc: BlinkToolCall) => ({
        id: tc.id,
        name: tc.function.name,
      }));
      const idx =
        out.push({
          role: "assistant",
          id: crypto.randomUUID(),
          content: msg.content ?? "",
          toolCalls,
        }) - 1;
      for (const tc of toolCalls) toolCallIndex.set(tc.id, idx);
    } else if (msg.role === "tool") {
      const idx = toolCallIndex.get(msg.tool_call_id);
      if (idx !== undefined) {
        const m = out[idx];
        if (m.role === "assistant") {
          m.toolCalls = m.toolCalls.map((tc) =>
            tc.id === msg.tool_call_id ? { ...tc, result: msg.content } : tc,
          );
        }
      }
    }
  }
  return out;
}

// ── Message loop ─────────────────────────────────────────────────────────────

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: any;
  try {
    msg = JSON.parse(trimmed);
  } catch (e) {
    out({ type: "error", error: `invalid json: ${String(e)}` });
    return;
  }

  if (msg.type === "ping") {
    out({ type: "pong" });
    return;
  }

  if (msg.type === "init") {
    const workspacePath = String(msg.workspacePath ?? process.cwd());
    providerBundle = {
      provider: msg.provider as ProviderConfig,
      maxTurns: msg.maxTurns as number,
      requirePermission: Boolean(msg.requirePermission),
      systemPrompt: msg.systemPrompt as string,
      allowTools: msg.allowTools !== false,
      persistSession: msg.persistSession !== false,
    };

    if (providerBundle.persistSession) {
      await initThreads(workspacePath);
    } else {
      threadsDir = null;
      currentThreadId = null;
      threadsIndex = { activeThreadId: "", threads: [] };
    }

    engine = ensureEngine();

    // Load active thread data
    const threadData =
      currentThreadId ? await loadThreadData(currentThreadId) : { messages: [], cliSessionIds: {} };
    cliSessionIds = threadData.cliSessionIds ?? {};
    if (threadData.messages.length > 0) {
      engine.setHistory(threadData.messages);
    }

    currentAssistantMsgId = null;
    chatInProgress = false;

    const availableProviders = await detectAvailableProviders();

    send("bridge_ready", {
      resumed: threadData.messages.length > 0,
      messageCount: threadData.messages.length,
      availableProviders,
      threads: threadsIndex.threads,
      activeThreadId: threadsIndex.activeThreadId,
    });

    if (threadData.messages.length > 0) {
      send("history", { messages: buildDisplayHistory(threadData.messages) });
    }
    return;
  }

  if (msg.type === "new_thread") {
    await persistCurrentThread();
    const meta = createThreadMeta();
    threadsIndex.threads.unshift(meta);
    threadsIndex.activeThreadId = meta.id;
    currentThreadId = meta.id;
    cliSessionIds = {};
    engine = ensureEngine();
    engine.clearHistory();
    await saveThreadData(meta.id, { messages: [], cliSessionIds: {} });
    await saveThreadsIndex();
    send("threads_list", { threads: threadsIndex.threads, activeThreadId: meta.id });
    return;
  }

  if (msg.type === "switch_thread") {
    const targetId = String(msg.threadId);
    if (targetId === currentThreadId) return;
    if (!threadsIndex.threads.some((t) => t.id === targetId)) return;

    await persistCurrentThread();
    threadsIndex.activeThreadId = targetId;
    currentThreadId = targetId;
    await saveThreadsIndex();

    const data = await loadThreadData(targetId);
    cliSessionIds = data.cliSessionIds ?? {};
    engine = ensureEngine();
    engine.clearHistory();
    if (data.messages.length > 0) engine.setHistory(data.messages);

    send("threads_list", { threads: threadsIndex.threads, activeThreadId: targetId });
    if (data.messages.length > 0) {
      send("history", { messages: buildDisplayHistory(data.messages) });
    } else {
      send("history", { messages: [] });
    }
    return;
  }

  if (msg.type === "rename_thread") {
    const meta = threadsIndex.threads.find((t) => t.id === String(msg.threadId));
    if (meta) {
      meta.name = String(msg.name).trim() || "New conversation";
      await saveThreadsIndex();
      send("threads_list", { threads: threadsIndex.threads, activeThreadId: currentThreadId ?? "" });
    }
    return;
  }

  if (msg.type === "delete_thread") {
    const deleteId = String(msg.threadId);
    threadsIndex.threads = threadsIndex.threads.filter((t) => t.id !== deleteId);

    // Delete the file
    try { await fs.unlink(threadFilePath(deleteId)); } catch {}

    // If we deleted the active thread, switch to first remaining or create new
    if (deleteId === currentThreadId) {
      if (threadsIndex.threads.length === 0) {
        const meta = createThreadMeta();
        threadsIndex.threads.push(meta);
        await saveThreadData(meta.id, { messages: [], cliSessionIds: {} });
      }
      const next = threadsIndex.threads[0];
      threadsIndex.activeThreadId = next.id;
      currentThreadId = next.id;
      const data = await loadThreadData(next.id);
      cliSessionIds = data.cliSessionIds ?? {};
      engine = ensureEngine();
      engine.clearHistory();
      if (data.messages.length > 0) engine.setHistory(data.messages);
      send("threads_list", { threads: threadsIndex.threads, activeThreadId: next.id });
      if (data.messages.length > 0) {
        send("history", { messages: buildDisplayHistory(data.messages) });
      } else {
        send("history", { messages: [] });
      }
    } else {
      await saveThreadsIndex();
      send("threads_list", { threads: threadsIndex.threads, activeThreadId: currentThreadId ?? "" });
    }
    return;
  }

  if (msg.type === "clear") {
    engine?.clearHistory();
    cliSessionIds = {};
    if (currentThreadId) {
      await saveThreadData(currentThreadId, { messages: [], cliSessionIds: {} });
      const meta = threadsIndex.threads.find((t) => t.id === currentThreadId);
      if (meta) { meta.messageCount = 0; meta.name = "New conversation"; }
      await saveThreadsIndex();
      send("threads_list", { threads: threadsIndex.threads, activeThreadId: currentThreadId });
    }
    return;
  }

  if (msg.type === "abort") {
    await handleAbort(msg.assistantMsgId);
    return;
  }

  if (msg.type === "permission_response") {
    const resolver = pendingPermissions.get(msg.reqId);
    if (resolver) {
      pendingPermissions.delete(msg.reqId);
      resolver(Boolean(msg.allowed));
    }
    return;
  }

  if (msg.type === "chat") {
    if (chatInProgress) {
      send("error", { error: "chat already in progress", assistantMsgId: msg.assistantMsgId });
      return;
    }
    if (!engine) {
      send("error", {
        error: "Bridge not initialized (missing init).",
        assistantMsgId: msg.assistantMsgId,
      });
      return;
    }

    chatInProgress = true;
    currentAssistantMsgId = msg.assistantMsgId as string;
    const text = String(msg.text ?? "");
    const thinkingOverride = msg.thinking === true ? true : undefined;
    const images = Array.isArray(msg.images)
      ? (msg.images as Array<{ data: string; mimeType: string }>)
      : undefined;

    try {
      for await (const ev of engine.send(text, { thinking: thinkingOverride, images })) {
        switch (ev.type) {
          case "text_delta":
            send("text_delta", { assistantMsgId: currentAssistantMsgId, delta: ev.delta });
            break;
          case "thinking_delta":
            send("thinking_delta", { assistantMsgId: currentAssistantMsgId, delta: ev.delta });
            break;
          case "tool_call_start":
            send("tool_call_start", {
              assistantMsgId: currentAssistantMsgId,
              callId: ev.callId,
              name: ev.name,
            });
            break;
          case "tool_call_result":
            send("tool_call_result", {
              assistantMsgId: currentAssistantMsgId,
              callId: ev.callId,
              result: ev.result,
              is_error: ev.is_error,
            });
            break;
          case "usage":
            send("context_usage", {
              assistantMsgId: currentAssistantMsgId,
              inputTokens: ev.inputTokens,
              outputTokens: ev.outputTokens,
            });
            break;
          case "error":
            send("error", { assistantMsgId: currentAssistantMsgId, error: ev.error });
            break;
        }
      }
    } finally {
      chatInProgress = false;
      if (currentAssistantMsgId) send("turn_done", { assistantMsgId: currentAssistantMsgId });
      // Persist thread data + update thread metadata after every turn
      if (threadsDir) {
        await persistCurrentThread();
        // Send updated thread list so UI can refresh name/count
        send("threads_list", { threads: threadsIndex.threads, activeThreadId: currentThreadId ?? "" });
      }
    }
    return;
  }

  send("error", { error: `unknown message type: ${String(msg.type)}` });
});
