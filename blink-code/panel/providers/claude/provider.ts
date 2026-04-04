import { spawn } from "node:child_process";
import * as readline from "node:readline";
import type { ChatProvider, StreamChunk } from "../types";

type Opts = {
  model?: string;
  getSessionId: () => string | null;
  saveSessionId: (id: string) => void;
};

// Claude CLI stream-json event shapes (subset we care about)
type ClaudeStreamEvent =
  | { type: "assistant"; message: { content: Array<{ type: string; text?: string }> } }
  | { type: "tool_use"; id: string; name: string }
  | { type: "result"; subtype: string; session_id: string }
  | { type: "system"; subtype: string; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

export function createClaudeCodeProvider(opts: Opts): ChatProvider {
  let abortChild: (() => void) | null = null;

  return {
    async *streamTurn(input): AsyncGenerator<StreamChunk> {
      const { messages, signal } = input;

      // Extract the latest user message — claude CLI manages its own history via session_id
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";

      const args: string[] = [
        "--output-format", "stream-json",
        "--print", prompt,
        "--no-input",
      ];

      const sessionId = opts.getSessionId();
      if (sessionId) args.push("--resume", sessionId);
      if (opts.model) args.push("--model", opts.model);

      const child = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        // Pass through PATH so the binary resolves correctly
        env: { ...process.env },
      });

      abortChild = () => child.kill("SIGTERM");
      signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });

      const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });

      let hadError = false;

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event: ClaudeStreamEvent;
        try {
          event = JSON.parse(trimmed) as ClaudeStreamEvent;
        } catch {
          continue;
        }

        if (event.type === "assistant") {
          for (const block of event.message.content ?? []) {
            if (block.type === "text" && block.text) {
              yield { kind: "text", delta: block.text };
            }
          }
        } else if (event.type === "tool_use") {
          // Claude handles tool calls internally — surface as an opaque event
          yield { kind: "text", delta: "" };
        } else if (event.type === "result") {
          if (event.session_id) {
            opts.saveSessionId(event.session_id);
          }
          if (event.subtype === "error") {
            const errEvent = event as { type: "result"; subtype: string; error?: string; session_id: string };
            hadError = true;
            yield { kind: "error", error: errEvent.error ?? "claude CLI returned an error" };
          }
        } else if (event.type === "system" && (event as { type: string; subtype?: string }).subtype === "error") {
          const sysEvent = event as { type: string; subtype: string; error?: { message?: string } };
          hadError = true;
          yield { kind: "error", error: sysEvent.error?.message ?? "claude CLI system error" };
        }
      }

      // Wait for process exit
      await new Promise<void>((resolve) => child.on("close", resolve));

      if (!hadError) {
        // Emit a no-op assistant chunk so engine records the turn
        yield {
          kind: "assistant",
          message: { content: null, tool_calls: undefined },
        };
      }

      abortChild = null;
    },
  };
}
