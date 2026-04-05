export type ProviderConfig =
  | {
      /** OpenAI-compatible endpoint (Ollama, custom, etc.) */
      type: "openai-compat";
      model: string;
      baseUrl?: string;
      apiKey?: string;
      maxTokens?: number;
    }
  | {
      /** Embedded CLI agent panel (Claude, Codex, Gemini, …) */
      type: "agent";
    }
  // Legacy types kept for backward-compat; treated as "agent" in the UI
  | {
      type: "anthropic";
      model: string;
      apiKey: string;
      thinking: boolean;
      thinkingBudget: number;
    }
  | {
      type: "claude-code";
      model?: string;
      effort?: "low" | "medium" | "high";
    }
  | {
      type: "codex";
      model?: string;
      effort?: "low" | "medium" | "high" | "xhigh";
    };

export type BlinkCodeConfig = {
  provider: ProviderConfig;
  maxTurns: number;
  requirePermission: boolean;
  allowTools: boolean;
};

const STORAGE_KEY = "blink-code-config";

const DEFAULTS: BlinkCodeConfig = {
  provider: {
    type: "openai-compat",
    model: "",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    maxTokens: 4096,
  },
  maxTurns: 16,
  requirePermission: false,
  allowTools: true,
};

export function loadBlinkCodeConfig(): BlinkCodeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BlinkCodeConfig>;
    return {
      ...DEFAULTS,
      ...parsed,
      provider: { ...DEFAULTS.provider, ...parsed.provider } as ProviderConfig,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBlinkCodeConfig(config: BlinkCodeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
