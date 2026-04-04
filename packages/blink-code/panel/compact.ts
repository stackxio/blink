/**
 * Panel-safe compact utilities.
 *
 * Re-exports from services/compact/prompt.ts — importable in both the Bun
 * ide-bridge subprocess AND the Tauri browser UI.
 */

export {
  getCompactPrompt,
  getPartialCompactPrompt,
  getCompactUserSummaryMessage,
  formatCompactSummary,
} from "../services/compact/prompt.js";
