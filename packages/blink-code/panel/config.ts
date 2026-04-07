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
      /** CLI agent panel (Claude, Codex, Gemini … run in embedded terminal) */
      type: "agent";
    };

export type BlinkCodeConfig = {
  provider: ProviderConfig;
  maxTurns: number;
  requirePermission: boolean;
  allowTools: boolean;
};

const STORAGE_KEY = "codrift-code-config";

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
    // Migrate any legacy provider types (claude-code, codex, anthropic) to defaults
    const provider = parsed.provider as { type?: string } | undefined;
    if (provider && provider.type !== "openai-compat" && provider.type !== "agent") {
      return { ...DEFAULTS };
    }
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
