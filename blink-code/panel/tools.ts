// Tool type used by engine.ts. Implementations live in ide-bridge.ts (Bun subprocess).
export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
};
