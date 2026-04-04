export type BlinkToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ImageBlock = { type: "image"; data: string; mimeType: string };
export type TextBlock = { type: "text"; text: string };
export type ContentBlock = TextBlock | ImageBlock;

export type BlinkMessage =
  | { role: "user"; content: string | ContentBlock[] }
  | { role: "assistant"; content: string | null; tool_calls?: BlinkToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAIToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type StreamChunk =
  | { kind: "text"; delta: string }
  | { kind: "thinking_delta"; delta: string }
  | { kind: "error"; error: string }
  | { kind: "usage"; inputTokens: number; outputTokens: number }
  | {
      kind: "assistant";
      message: {
        content: string | null;
        tool_calls?: BlinkToolCall[];
      };
    };

export type ChatProvider = {
  streamTurn(input: {
    system: string;
    messages: BlinkMessage[];
    tools: OpenAIToolSpec[];
    signal?: AbortSignal;
    thinking?: boolean;
  }): AsyncGenerator<StreamChunk>;
};
