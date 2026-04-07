import type { ProviderConfig } from "../config";
import { createOpenAICompatProvider } from "./openai-compat";
import type { ChatProvider } from "./types";

export type { BlinkMessage, BlinkToolCall, ChatProvider } from "./types";

export function createProvider(p: ProviderConfig): ChatProvider {
  if (p.type === "openai-compat") {
    return createOpenAICompatProvider({
      model: p.model,
      baseUrl: p.baseUrl ?? "http://localhost:11434/v1",
      apiKey: p.apiKey ?? "ollama",
      maxTokens: p.maxTokens ?? 4096,
    });
  }

  // "agent" is handled by CliAgentPanel — createProvider is never called for it
  throw new Error("agent provider type is handled by CliAgentPanel, not createProvider");
}
