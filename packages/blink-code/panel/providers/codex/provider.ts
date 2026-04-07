import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import type { ChatProvider, StreamChunk } from "../types";

type Opts = {
  model?: string;
  effort?: string;
};

/**
 * Codex provider using the `codex app-server` JSON-RPC protocol.
 *
 * Architecture: a single background reader loop processes every stdout line,
 * dispatching RPC responses to awaiting callers and pushing stream notifications
 * into a queue consumed by the main generator.
 */
export function createCodexProvider(opts: Opts): ChatProvider {
  return {
    async *streamTurn(input): AsyncGenerator<StreamChunk> {
      const { messages, signal } = input;

      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";

      const codexHome = path.join(os.homedir(), ".codrift", "codex");

      const child = spawn("codex", ["app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CODEX_HOME: codexHome },
      });

      signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });

      // Drain stderr
      let stderrText = "";
      child.stderr!.on("data", (chunk: Buffer) => {
        stderrText += chunk.toString();
      });

      const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });

      // ── Shared state ────────────────────────────────────────────────────────

      let msgId = 0;
      const pending = new Map<
        number,
        (msg: { result?: unknown; error?: { message?: string } }) => void
      >();

      // Notification queue — background reader pushes here, main generator consumes
      type QueueItem =
        | { type: "notification"; method: string; params: unknown }
        | { type: "rpc_request"; id: number; method: string; params: unknown }
        | { type: "eof" };
      const notifQueue: QueueItem[] = [];
      let notifWakeup: (() => void) | null = null;

      function pushNotif(item: QueueItem) {
        notifQueue.push(item);
        if (notifWakeup) {
          const w = notifWakeup;
          notifWakeup = null;
          w();
        }
      }

      async function nextNotif(): Promise<QueueItem> {
        if (notifQueue.length > 0) return notifQueue.shift()!;
        return new Promise<QueueItem>((resolve) => {
          notifWakeup = () => resolve(notifQueue.shift()!);
        });
      }

      // ── Background reader (runs concurrently with the generator) ────────────

      const readerDone = (async () => {
        for await (const line of rl) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let msg: {
            id?: number;
            result?: unknown;
            error?: { message?: string };
            method?: string;
            params?: unknown;
          };
          try {
            msg = JSON.parse(trimmed) as typeof msg;
          } catch {
            continue;
          }

          if (msg.id != null && pending.has(msg.id)) {
            // RPC response — wake up the awaiting rpc() call
            const resolve = pending.get(msg.id)!;
            pending.delete(msg.id);
            resolve({ result: msg.result, error: msg.error });
          } else if (msg.method) {
            if (msg.id != null) {
              // Server-initiated request (e.g. approval) — push to queue so generator can respond
              pushNotif({
                type: "rpc_request",
                id: msg.id,
                method: msg.method,
                params: msg.params,
              });
            } else {
              pushNotif({ type: "notification", method: msg.method, params: msg.params });
            }
          }
        }
        pushNotif({ type: "eof" });
      })();

      // ── RPC helper ──────────────────────────────────────────────────────────

      function sendLine(method: string, params: unknown, id?: number) {
        const msg =
          id != null ? { jsonrpc: "2.0", id, method, params } : { jsonrpc: "2.0", method, params };
        child.stdin.write(JSON.stringify(msg) + "\n");
      }

      async function rpc(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
        const id = ++msgId;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`codex RPC timeout: ${method}`));
          }, timeoutMs);
          pending.set(id, (msg) => {
            clearTimeout(timer);
            if (msg.error) reject(new Error(msg.error.message ?? "codex RPC error"));
            else resolve(msg.result);
          });
          sendLine(method, params, id);
        });
      }

      // ── Main flow ───────────────────────────────────────────────────────────

      try {
        // 1. Handshake
        await rpc("initialize", {
          clientInfo: { name: "blink", version: "1.0" },
          capabilities: {},
        });
        sendLine("initialized", {});

        // 2. Start thread → get threadId
        const threadResult = (await rpc("thread/start", {
          model: opts.model ?? "gpt-5.4",
          cwd: process.cwd(),
          approvalPolicy: "never",
          sandbox: "danger-full-access",
        })) as { threadId?: string };

        const threadId = threadResult?.threadId;
        if (!threadId) {
          yield { kind: "error", error: "codex: no threadId in thread/start response" };
          return;
        }

        // 3. Send turn
        const turnParams: Record<string, unknown> = {
          threadId,
          input: [{ type: "text", text: prompt }],
          model: opts.model ?? "gpt-5.4",
        };
        if (opts.effort) turnParams.effort = opts.effort;
        sendLine("turn/start", turnParams, ++msgId);
        // turn/start ack will arrive as a notification or response; handled in the queue

        // 4. Stream notifications until turn completes
        let fullText = "";
        while (true) {
          const item = await nextNotif();

          if (item.type === "eof") break;

          if (item.type === "rpc_request") {
            // Auto-approve any server-initiated requests (e.g. file access approval)
            sendLine("", {}, undefined); // no-op
            const response = { jsonrpc: "2.0", id: item.id, result: { decision: "approve" } };
            child.stdin.write(JSON.stringify(response) + "\n");
            continue;
          }

          const { method, params } = item as {
            type: "notification";
            method: string;
            params: unknown;
          };
          const p = params as Record<string, unknown> | undefined;

          if (
            method === "item/agentMessage/delta" ||
            method === "turn/delta" ||
            method === "message/delta"
          ) {
            const content = (p?.delta as { content?: Array<{ type?: string; text?: string }> })
              ?.content;
            if (content) {
              for (const block of content) {
                if (block.type === "text" && block.text) {
                  fullText += block.text;
                  yield { kind: "text", delta: block.text };
                }
              }
            }
            const text = p?.text as string | undefined;
            if (text) {
              fullText += text;
              yield { kind: "text", delta: text };
            }
          } else if (
            method === "turn/completed" ||
            method === "turn/finished" ||
            method === "turn/done"
          ) {
            break;
          } else if (method === "turn/error" || method === "process/error") {
            yield { kind: "error", error: (p?.message as string) ?? "codex turn error" };
            break;
          }
        }

        child.stdin.end();
        await readerDone;

        yield { kind: "assistant", message: { content: fullText || null, tool_calls: undefined } };
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (stderrText.trim() && errMsg.includes("timeout")) {
          yield { kind: "error", error: stderrText.trim().slice(0, 500) };
        } else {
          yield { kind: "error", error: errMsg };
        }
      } finally {
        child.kill("SIGTERM");
      }
    },
  };
}
