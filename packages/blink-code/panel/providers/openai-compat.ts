import type { BlinkMessage, BlinkToolCall, ChatProvider } from "./types";

type ProviderOpts = {
  model: string;
  baseUrl: string;
  apiKey: string;
  maxTokens: number;
};

/**
 * Many Ollama models (Qwen, Llama, Mistral tool variants) don't support the
 * OpenAI tool_calls delta format. They output tool calls as plain JSON text,
 * typically as: {"name":"tool_name","arguments":{...}}
 * or wrapped in XML: <tool_call>...</tool_call>
 *
 * This function detects those patterns and converts them to BlinkToolCall[].
 * Only fires when the known tool names list contains the parsed name, so we
 * don't false-positive on regular JSON responses.
 */
function parseTextToolCalls(text: string, knownTools: string[]): BlinkToolCall[] {
  const results: BlinkToolCall[] = [];

  // Helper to try parsing a single call object
  function tryObj(raw: string): BlinkToolCall | null {
    try {
      const obj = JSON.parse(raw) as { name?: string; arguments?: unknown };
      if (typeof obj.name === "string" && knownTools.includes(obj.name) && obj.arguments != null) {
        return {
          id: `toolu_${crypto.randomUUID()}`,
          type: "function",
          function: { name: obj.name, arguments: JSON.stringify(obj.arguments) },
        };
      }
    } catch {}
    return null;
  }

  // 1. Try whole text as a single JSON object
  const direct = tryObj(text);
  if (direct) return [direct];

  // 2. XML-wrapped: <tool_call>...</tool_call> or <functioncall>...</functioncall>
  const xmlRe = /<(?:tool_call|functioncall)>([\s\S]+?)<\/(?:tool_call|functioncall)>/g;
  let m: RegExpExecArray | null;
  while ((m = xmlRe.exec(text)) !== null) {
    const tc = tryObj(m[1].trim());
    if (tc) results.push(tc);
  }
  if (results.length > 0) return results;

  // 3. Multiple JSON objects on separate lines
  for (const line of text.split("\n")) {
    const tc = tryObj(line.trim());
    if (tc) results.push(tc);
  }

  return results;
}

function openAiMessages(system: string, messages: BlinkMessage[]): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") {
        out.push({ role: "user", content: m.content });
      } else {
        out.push({
          role: "user",
          content: m.content.map((block) => {
            if (block.type === "image") {
              return {
                type: "image_url",
                image_url: { url: `data:${block.mimeType};base64,${block.data}` },
              };
            }
            return { type: "text", text: block.text };
          }),
        });
      }
    } else if (m.role === "assistant") {
      const entry: Record<string, unknown> = {
        role: "assistant",
        // Some endpoints reject null content — coerce to empty string
        content: m.content ?? "",
      };
      if (m.tool_calls?.length) entry.tool_calls = m.tool_calls;
      out.push(entry);
    } else {
      out.push({
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: m.content,
      });
    }
  }
  return out;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function createOpenAICompatProvider(opts: ProviderOpts): ChatProvider {
  const { model, apiKey, maxTokens } = opts;
  const base = normalizeBaseUrl(opts.baseUrl);

  return {
    async *streamTurn(input) {
      const { system, messages, tools, signal } = input;
      const url = `${base}/chat/completions`;

      const doFetch = (includeTools: boolean) =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: maxTokens,
            messages: openAiMessages(system, messages),
            tools: includeTools && tools.length ? tools : undefined,
          }),
          signal,
        });

      let res = await doFetch(true);

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        // Some models don't support tool calling — retry without tools
        if (tools.length > 0 && errText.toLowerCase().includes("does not support tools")) {
          res = await doFetch(false);
          if (!res.ok) {
            const errText2 = await res.text().catch(() => res.statusText);
            yield {
              kind: "error",
              error: `Request failed (${res.status}): ${errText2.slice(0, 500)}`,
            };
            return;
          }
        } else {
          yield {
            kind: "error",
            error: `Request failed (${res.status}): ${errText.slice(0, 500)}`,
          };
          return;
        }
      }

      if (!res.body) {
        yield {
          kind: "assistant",
          message: { content: "(empty response body)", tool_calls: undefined },
        };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const acc = new Map<number, { id: string; name: string; args: string }>();
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
          if (data === "[DONE]") continue;
          let json: {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          try {
            json = JSON.parse(data) as typeof json;
          } catch {
            continue;
          }
          if (json.usage) {
            usageInputTokens = json.usage.prompt_tokens ?? 0;
            usageOutputTokens = json.usage.completion_tokens ?? 0;
          }
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            fullText += delta.content;
            yield { kind: "text", delta: delta.content };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let slot = acc.get(idx);
              if (!slot) {
                slot = { id: "", name: "", args: "" };
                acc.set(idx, slot);
              }
              if (tc.id) slot.id += tc.id;
              if (tc.function?.name) slot.name += tc.function.name;
              if (tc.function?.arguments) slot.args += tc.function.arguments;
            }
          }
        }
      }

      const tool_calls: BlinkToolCall[] = [];
      const indices = [...acc.keys()].sort((a, b) => a - b);
      for (const idx of indices) {
        const v = acc.get(idx);
        if (!v?.name) continue;
        tool_calls.push({
          id: v.id || `toolu_${crypto.randomUUID()}`,
          type: "function",
          function: { name: v.name, arguments: v.args },
        });
      }

      // Some Ollama models output tool calls as plain JSON text rather than
      // using the tool_calls delta format. Detect and convert them.
      if (tool_calls.length === 0 && fullText.trim()) {
        const textCalls = parseTextToolCalls(
          fullText.trim(),
          tools.map((t) => t.function.name),
        );
        if (textCalls.length > 0) {
          tool_calls.push(...textCalls);
          fullText = "";
        }
      }

      if (usageInputTokens > 0) {
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
