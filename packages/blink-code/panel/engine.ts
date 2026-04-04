import type { ToolDef } from "./tools";
import type { BlinkMessage, BlinkToolCall, ChatProvider, OpenAIToolSpec } from "./providers/types";

export type EngineEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_call_start"; callId: string; name: string }
  | { type: "tool_call_result"; callId: string; result: string; is_error: boolean }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; error: string };

type EngineOpts = {
  provider: ChatProvider;
  tools: ToolDef[];
  system: string;
  maxTurns: number;
  onPermission?: (name: string, input: Record<string, unknown>) => Promise<boolean>;
};

export class BlinkEngine {
  private _messages: BlinkMessage[] = [];
  private abortCtl: AbortController | null = null;
  private opts: EngineOpts;

  constructor(opts: EngineOpts) {
    this.opts = opts;
  }

  get messages(): BlinkMessage[] {
    return this._messages;
  }

  setHistory(messages: BlinkMessage[]): void {
    this._messages = [...messages];
  }

  clearHistory(): void {
    this._messages = [];
  }

  abort(): void {
    this.abortCtl?.abort();
  }

  async *send(userText: string, opts?: { thinking?: boolean }): AsyncGenerator<EngineEvent> {
    this.abortCtl = new AbortController();
    const signal = this.abortCtl.signal;
    const openaiTools: OpenAIToolSpec[] = this.opts.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    this._messages.push({ role: "user", content: userText });

    try {
      for (let turn = 0; turn < this.opts.maxTurns; turn++) {
        if (signal.aborted) break;

        let assistant: {
          content: string | null;
          tool_calls?: BlinkToolCall[];
        } | null = null;

        for await (const chunk of this.opts.provider.streamTurn({
          system: this.opts.system,
          messages: this._messages,
          tools: openaiTools,
          signal,
          thinking: opts?.thinking,
        })) {
          if (chunk.kind === "text") {
            yield { type: "text_delta", delta: chunk.delta };
          } else if (chunk.kind === "thinking_delta") {
            yield { type: "thinking_delta", delta: chunk.delta };
          } else if (chunk.kind === "error") {
            yield { type: "error", error: chunk.error };
            return;
          } else if (chunk.kind === "usage") {
            yield {
              type: "usage",
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
            };
          } else if (chunk.kind === "assistant") {
            assistant = chunk.message;
          }
        }

        if (!assistant) break;

        this._messages.push({
          role: "assistant",
          content: assistant.content,
          tool_calls: assistant.tool_calls,
        });

        const tcs = assistant.tool_calls;
        if (!tcs?.length) break;

        for (const tc of tcs) {
          yield { type: "tool_call_start", callId: tc.id, name: tc.function.name };

          let input: Record<string, unknown>;
          try {
            input = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            input = {};
          }

          const def = this.opts.tools.find((t) => t.name === tc.function.name);
          let result: string;
          let is_error = false;

          try {
            if (
              this.opts.onPermission &&
              !(await this.opts.onPermission(tc.function.name, input))
            ) {
              result = "User denied permission to run this tool.";
              is_error = true;
            } else if (def) {
              result = await def.execute(input);
            } else {
              result = `Unknown tool: ${tc.function.name}`;
              is_error = true;
            }
          } catch (e) {
            result = e instanceof Error ? e.message : String(e);
            is_error = true;
          }

          yield { type: "tool_call_result", callId: tc.id, result, is_error };
          this._messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: "error", error: msg };
    }
  }
}
