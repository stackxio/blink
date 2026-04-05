import type { ProviderConfig } from "../config";
import { createOpenAICompatProvider } from "./openai-compat";
import { createAnthropicProvider } from "./anthropic";
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

  if (p.type === "anthropic") {
    return createAnthropicProvider({
      model: p.model,
      apiKey: p.apiKey,
      thinking: p.thinking,
      thinkingBudget: p.thinkingBudget,
    });
  }

  if (p.type === "claude-code") {
    return createClaudeCodeProvider({
      model: p.model,
      effort: p.effort,
      getSessionId: () => session?.getSessionId("claude") ?? null,
      saveSessionId: (id) => session?.saveSessionId("claude", id),
    });
  }

  if (p.type === "codex") {
    return createCodexProvider({ model: p.model, effort: p.effort });
  }

  // "agent" type is handled by the CLI agent panel; createProvider is never
  // called for it, but we need to satisfy the exhaustive type check.
  if (p.type === "agent") {
    throw new Error("agent provider type is handled by CliAgentPanel, not createProvider");
  }

  // Exhaustive guard — should never reach here
  const _: never = p;
  throw new Error(`Unknown provider type: ${JSON.stringify(_)}`);
}
