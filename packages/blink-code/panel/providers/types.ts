export type BlinkToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type BlinkMessage =
  | { role: "user"; content: string }
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
  | { kind: "error"; error: string }
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
  }): AsyncGenerator<StreamChunk>;
};
