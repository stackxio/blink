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
 * Architecture (from openai/codex):
 *   spawn("codex", ["app-server"]) with stdio all piped
 *   → write JSON-RPC requests to stdin
 *   → read JSON-RPC responses/notifications from stdout line-by-line
 */
export function createCodexProvider(opts: Opts): ChatProvider {
  return {
    async *streamTurn(input): AsyncGenerator<StreamChunk> {
      const { messages, signal } = input;

      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";

      const codexHome = path.join(os.homedir(), ".blink", "codex");

      const child = spawn("codex", ["app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CODEX_HOME: codexHome },
      });

      signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });

      // Drain stderr so the process never blocks
      let stderrText = "";
      child.stderr!.on("data", (chunk: Buffer) => {
        stderrText += chunk.toString();
      });

      const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });

      let msgId = 0;
      function send(method: string, params: unknown, id?: number) {
        const msg =
          id != null
            ? { jsonrpc: "2.0", id, method, params }
            : { jsonrpc: "2.0", method, params };
        child.stdin.write(JSON.stringify(msg) + "\n");
      }

      // Collect one response by id
      const pending = new Map<number, (result: unknown) => void>();
      const lineQueue: string[] = [];
      let lineResolve: (() => void) | null = null;

      rl.on("line", (line) => {
        lineQueue.push(line);
        if (lineResolve) {
          const r = lineResolve;
          lineResolve = null;
          r();
        }
      });

      async function nextLine(): Promise<string | null> {
        if (lineQueue.length > 0) return lineQueue.shift()!;
        return new Promise<string | null>((resolve) => {
          const onClose = () => resolve(null);
          lineResolve = () => {
            rl.off("close", onClose);
            resolve(lineQueue.shift() ?? null);
          };
          rl.once("close", onClose);
        });
      }

      async function rpc(method: string, params: unknown): Promise<unknown> {
        const id = ++msgId;
        return new Promise((resolve) => {
          pending.set(id, resolve);
          send(method, params, id);
        });
      }

      // Event loop — reads lines and dispatches to pending RPC resolvers or yields stream events
      async function* eventLoop(): AsyncGenerator<StreamChunk> {
        while (true) {
          const line = await nextLine();
          if (line === null) break;
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

          // RPC response
          if (msg.id != null && pending.has(msg.id)) {
            const resolve = pending.get(msg.id)!;
            pending.delete(msg.id);
            if (msg.error) {
              yield { kind: "error", error: msg.error.message ?? "codex RPC error" };
              return;
            }
            resolve(msg.result);
            continue;
          }

          // Notification
          const method = msg.method;
          if (!method) continue;

          if (
            method === "item/agentMessage/delta" ||
            method === "item/userMessage/delta" ||
            method === "turn/delta"
          ) {
            const params = msg.params as {
              delta?: { content?: Array<{ type?: string; text?: string }> };
              text?: string;
            };
            if (params?.text) {
              yield { kind: "text", delta: params.text };
            } else if (params?.delta?.content) {
              for (const block of params.delta.content) {
                if (block.type === "text" && block.text) {
                  yield { kind: "text", delta: block.text };
                }
              }
            }
          } else if (method === "turn/completed" || method === "turn/finished") {
            return;
          } else if (method === "turn/error" || method === "process/error") {
            const params = msg.params as { message?: string };
            yield { kind: "error", error: params?.message ?? "codex error" };
            return;
          }
        }
      }

      try {
        // 1. Handshake
        await rpc("initialize", {
          clientInfo: { name: "blink", version: "1.0" },
          capabilities: {},
        });
        send("initialized", {});

        // 2. Start thread
        const threadResult = (await rpc("thread/start", {
          model: opts.model ?? "gpt-5.4",
          cwd: process.cwd(),
          approvalPolicy: "never",
          sandbox: "danger-full-access",
        })) as { threadId?: string };

        const threadId = threadResult?.threadId;
        if (!threadId) {
          yield { kind: "error", error: "codex: failed to start thread (no threadId)" };
          return;
        }

        // 3. Send turn
        const turnParams: Record<string, unknown> = {
          threadId,
          input: [{ type: "text", text: prompt }],
          model: opts.model ?? "gpt-5.4",
        };
        if (opts.effort) turnParams.effort = opts.effort;
        send("turn/start", turnParams, ++msgId);
        // turn/start result arrives in the event loop — let the loop handle it

        let fullText = "";
        for await (const chunk of eventLoop()) {
          if (chunk.kind === "text") fullText += chunk.delta;
          yield chunk;
        }

        child.stdin.end();
        yield { kind: "assistant", message: { content: fullText || null, tool_calls: undefined } };
      } catch (e) {
        child.kill("SIGTERM");
        yield { kind: "error", error: e instanceof Error ? e.message : String(e) };
      } finally {
        child.kill("SIGTERM");
      }
    },
  };
}
