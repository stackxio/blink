import { spawn } from "node:child_process";
import * as readline from "node:readline";
import type { ChatProvider, StreamChunk } from "../types";

type Opts = {
  model?: string;
  getSessionId: () => string | null;
  saveSessionId: (id: string) => void;
};

// Claude CLI stream-json event shapes (subset we care about)
type ClaudeAssistantEvent = {
  type: "assistant";
  message: { content: Array<{ type: string; text?: string }> };
};
type ClaudeResultEvent = { type: "result"; subtype: string; session_id?: string; error?: string };
type ClaudeSystemEvent = { type: "system"; subtype: string; error?: { message?: string } };
type ClaudeStreamEvent =
  | ClaudeAssistantEvent
  | ClaudeResultEvent
  | ClaudeSystemEvent
  | { type: string; [k: string]: unknown };

export function createClaudeCodeProvider(opts: Opts): ChatProvider {
  return {
    async *streamTurn(input): AsyncGenerator<StreamChunk> {
      const { messages, signal } = input;

      // Extract the latest user message — claude CLI manages its own history via session_id
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";

      const args: string[] = ["--output-format", "stream-json", "--print", prompt, "--no-input"];

      const sessionId = opts.getSessionId();
      if (sessionId) args.push("--resume", sessionId);
      if (opts.model) args.push("--model", opts.model);

      const child = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        // Pass through PATH so the binary resolves correctly
        env: { ...process.env },
      });

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
          const e = event as ClaudeAssistantEvent;
          for (const block of e.message.content ?? []) {
            if (block.type === "text" && block.text) {
              yield { kind: "text", delta: block.text };
            }
          }
        } else if (event.type === "tool_use") {
          // Claude handles tool calls internally — surface as an opaque event
          yield { kind: "text", delta: "" };
        } else if (event.type === "result") {
          const e = event as ClaudeResultEvent;
          if (e.session_id) {
            opts.saveSessionId(e.session_id);
          }
          if (e.subtype === "error") {
            hadError = true;
            yield { kind: "error", error: e.error ?? "claude CLI returned an error" };
          }
        } else if (event.type === "system") {
          const e = event as ClaudeSystemEvent;
          if (e.subtype === "error") {
            hadError = true;
            yield { kind: "error", error: e.error?.message ?? "claude CLI system error" };
          }
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
    },
  };
}
