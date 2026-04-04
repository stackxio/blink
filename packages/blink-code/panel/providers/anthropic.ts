import type { BlinkMessage, BlinkToolCall, ChatProvider, OpenAIToolSpec } from "./types";

type AnthropicOpts = {
  model: string;
  apiKey: string;
  thinking: boolean;
  thinkingBudget: number;
};

// Convert OpenAI-style BlinkMessages to Anthropic API message format
function toAnthropicMessages(messages: BlinkMessage[]): unknown[] {
  const result: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  for (const m of messages) {
    if (m.role === "user") {
      result.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.tool_calls?.length) {
        const content: unknown[] = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls) {
          let input: unknown = {};
          try {
            input = JSON.parse(tc.function.arguments || "{}");
          } catch {}
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
        result.push({ role: "assistant", content });
      } else {
        result.push({ role: "assistant", content: m.content ?? "" });
      }
    } else if (m.role === "tool") {
      // Group sequential tool results into the same user message
      const last = result[result.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as unknown[]).push({
          type: "tool_result",
          tool_use_id: m.tool_call_id,
          content: m.content,
        });
      } else {
        result.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: m.content }],
        });
      }
    }
  }

  return result;
}

// Convert OpenAI tool spec format to Anthropic tool format
function toAnthropicTools(tools: OpenAIToolSpec[]): unknown[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

export function createAnthropicProvider(opts: AnthropicOpts): ChatProvider {
  return {
    async *streamTurn(input) {
      const { system, messages, tools, signal } = input;
      const useThinking = input.thinking ?? opts.thinking;

      // When thinking is enabled, max_tokens must exceed budget_tokens
      const maxTokens = useThinking ? Math.max(16000, opts.thinkingBudget + 4000) : 8192;

      const body: Record<string, unknown> = {
        model: opts.model,
        max_tokens: maxTokens,
        system,
        messages: toAnthropicMessages(messages),
        stream: true,
      };

      if (tools.length) {
        body.tools = toAnthropicTools(tools);
      }

      if (useThinking) {
        body.thinking = { type: "enabled", budget_tokens: opts.thinkingBudget };
      }

      let res: Response;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": opts.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (e) {
        yield { kind: "error", error: e instanceof Error ? e.message : String(e) };
        return;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        yield { kind: "error", error: `Anthropic API (${res.status}): ${errText.slice(0, 500)}` };
        return;
      }

      if (!res.body) {
        yield { kind: "assistant", message: { content: "(empty response)", tool_calls: undefined } };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Track content blocks by index
      const blockTypes = new Map<number, string>(); // "thinking" | "text" | "tool_use"
      const blockIds = new Map<number, string>();
      const blockNames = new Map<number, string>();
      const blockArgs = new Map<number, string>();

      let fullText = "";
      const tool_calls: BlinkToolCall[] = [];
      let usageInputTokens = 0;
      let usageOutputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data) continue;

          let json: {
            type?: string;
            index?: number;
            content_block?: { type: string; id?: string; name?: string };
            delta?: {
              type?: string;
              text?: string;
              thinking?: string;
              partial_json?: string;
            };
            usage?: { output_tokens?: number };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          };

          try {
            json = JSON.parse(data) as typeof json;
          } catch {
            continue;
          }

          const evType = json.type;

          if (evType === "message_start") {
            usageInputTokens = json.message?.usage?.input_tokens ?? 0;
          } else if (evType === "content_block_start") {
            const idx = json.index ?? 0;
            const bt = json.content_block?.type ?? "text";
            blockTypes.set(idx, bt);
            if (bt === "tool_use") {
              blockIds.set(idx, json.content_block?.id ?? `toolu_${crypto.randomUUID()}`);
              blockNames.set(idx, json.content_block?.name ?? "");
              blockArgs.set(idx, "");
            }
          } else if (evType === "content_block_delta") {
            const idx = json.index ?? 0;
            const bt = blockTypes.get(idx);
            const delta = json.delta;
            if (!delta) continue;

            if (bt === "text" && delta.type === "text_delta" && delta.text) {
              fullText += delta.text;
              yield { kind: "text", delta: delta.text };
            } else if (bt === "thinking" && delta.type === "thinking_delta" && delta.thinking) {
              yield { kind: "thinking_delta", delta: delta.thinking };
            } else if (
              bt === "tool_use" &&
              delta.type === "input_json_delta" &&
              delta.partial_json
            ) {
              blockArgs.set(idx, (blockArgs.get(idx) ?? "") + delta.partial_json);
            }
          } else if (evType === "content_block_stop") {
            const idx = json.index ?? 0;
            if (blockTypes.get(idx) === "tool_use") {
              const id = blockIds.get(idx) ?? `toolu_${crypto.randomUUID()}`;
              const name = blockNames.get(idx) ?? "";
              const args = blockArgs.get(idx) ?? "{}";
              tool_calls.push({ id, type: "function", function: { name, arguments: args } });
            }
          } else if (evType === "message_delta") {
            usageOutputTokens = json.usage?.output_tokens ?? usageOutputTokens;
          }
        }
      }

      if (usageInputTokens > 0 || usageOutputTokens > 0) {
        yield { kind: "usage", inputTokens: usageInputTokens, outputTokens: usageOutputTokens };
      }

      yield {
        kind: "assistant",
        message: {
          content: fullText || null,
          tool_calls: tool_calls.length ? tool_calls : undefined,
        },
      };
    },
  };
}
