/**
 * @blink/contracts — bridge-protocol
 *
 * Canonical types for the line-delimited JSON protocol between:
 *   - The Tauri UI (BlinkCodePanel.tsx)
 *   - The blink-code subprocess (ide-bridge.ts)
 *
 * Both sides must stay in sync with this file.
 */

// ── Shared sub-types ──────────────────────────────────────────────────────────

export type DisplayToolCall = {
  id: string;
  name: string;
  result?: string;
  is_error?: boolean;
};

export type HistoryDisplayMessage =
  | { role: "user"; id: string; content: string }
  | { role: "assistant"; id: string; content: string; toolCalls: DisplayToolCall[] };

// ── Bridge → UI (outgoing from ide-bridge.ts) ────────────────────────────────

export type BridgeOutEvent =
  | { type: "text_delta"; assistantMsgId: string; delta: string }
  | { type: "tool_call_start"; assistantMsgId: string; callId: string; name: string }
  | {
      type: "tool_call_result";
      assistantMsgId: string;
      callId: string;
      result: string;
      is_error: boolean;
    }
  | { type: "turn_done"; assistantMsgId: string }
  | { type: "context_usage"; assistantMsgId: string; inputTokens: number; outputTokens: number }
  | {
      type: "bridge_ready";
      resumed?: boolean;
      messageCount?: number;
      availableProviders?: string[];
    }
  | { type: "history"; messages: HistoryDisplayMessage[] }
  | { type: "permission_request"; reqId: string; toolName: string; input: Record<string, unknown> }
  | { type: "error"; error: string; assistantMsgId?: string }
  | { type: "pong" };

// ── UI → Bridge (incoming to ide-bridge.ts) ──────────────────────────────────

export type BridgeInEvent =
  | { type: "ping" }
  | {
      type: "init";
      workspacePath: string;
      provider: unknown;
      systemPrompt: string;
      maxTurns: number;
      requirePermission: boolean;
      allowTools: boolean;
      persistSession: boolean;
    }
  | { type: "chat"; assistantMsgId: string; text: string }
  | { type: "abort"; assistantMsgId?: string }
  | { type: "permission_response"; reqId: string; allowed: boolean }
  | { type: "clear" };
