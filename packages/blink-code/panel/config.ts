import { z } from "zod";

// ── Schemas ───────────────────────────────────────────────────────────────────

const ProviderConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("openai-compat"),
    model: z.string().default(""),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    maxTokens: z.number().optional(),
  }),
  z.object({
    type: z.literal("agent"),
  }),
]);

const BlinkCodeConfigSchema = z.object({
  provider: ProviderConfigSchema,
  maxTurns: z.number().default(16),
  requirePermission: z.boolean().default(false),
  allowTools: z.boolean().default(true),
});

// ── Types (inferred from schemas) ─────────────────────────────────────────────

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type BlinkCodeConfig = z.infer<typeof BlinkCodeConfigSchema>;

// ── Persistence ───────────────────────────────────────────────────────────────

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
    const parsed = BlinkCodeConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { ...DEFAULTS };
    return parsed.data;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBlinkCodeConfig(config: BlinkCodeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
