import type { ProviderConfig } from "../config";
import { createOpenAICompatProvider } from "./openai-compat";
import { createClaudeCodeProvider } from "./claude/provider";
import { createCodexProvider } from "./codex/provider";
import type { ChatProvider } from "./types";

export type { BlinkMessage, BlinkToolCall, ChatProvider } from "./types";

type SessionCallbacks = {
  getSessionId: (key: string) => string | null;
  saveSessionId: (key: string, id: string) => void;
};

export function createProvider(p: ProviderConfig, session?: SessionCallbacks): ChatProvider {
  const maxTokens = p.type === "openai-compat" ? (p.maxTokens ?? 4096) : undefined;

  if (p.type === "openai-compat") {
    return createOpenAICompatProvider({
      model: p.model,
      baseUrl: p.baseUrl ?? "http://localhost:11434/v1",
      apiKey: p.apiKey ?? "ollama",
      maxTokens: maxTokens!,
    });
  }

  if (p.type === "claude-code") {
    return createClaudeCodeProvider({
      model: p.model,
      getSessionId: () => session?.getSessionId("claude") ?? null,
      saveSessionId: (id) => session?.saveSessionId("claude", id),
    });
  }

  if (p.type === "codex") {
    return createCodexProvider({ model: p.model });
  }

  // Exhaustive guard — should never reach here
  const _: never = p;
  throw new Error(`Unknown provider type: ${JSON.stringify(_)}`);
}
