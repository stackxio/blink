import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import type { ChatProvider, StreamChunk } from "../types";

type Opts = {
  model?: string;
};

export function createCodexProvider(opts: Opts): ChatProvider {
  return {
    async *streamTurn(input): AsyncGenerator<StreamChunk> {
      const { messages, signal } = input;

      // Extract the latest user message — codex manages its own context
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";

      const args: string[] = ["--full-auto", prompt];
      if (opts.model) args.push("--model", opts.model);

      // Store codex state in ~/.blink/codex/ to keep it isolated from any other installs
      const codexHome = path.join(os.homedir(), ".blink", "codex");

      const child = spawn("codex", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CODEX_HOME: codexHome },
      });

      signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });

      const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });

      let fullText = "";
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Try to parse as JSON first (codex may output structured events)
        try {
          const event = JSON.parse(trimmed) as {
            type?: string;
            text?: string;
            delta?: string;
            content?: string;
          };
          if (event.delta) {
            fullText += event.delta;
            yield { kind: "text", delta: event.delta };
            continue;
          }
          if (event.text) {
            fullText += event.text;
            yield { kind: "text", delta: event.text };
            continue;
          }
          if (event.content) {
            fullText += event.content;
            yield { kind: "text", delta: event.content };
            continue;
          }
        } catch {
          // Plain text line — stream it as-is
          const delta = trimmed + "\n";
          fullText += delta;
          yield { kind: "text", delta };
        }
      }

      await new Promise<void>((resolve) => child.on("close", resolve));

      yield {
        kind: "assistant",
        message: { content: fullText || null, tool_calls: undefined },
      };
    },
  };
}
