/**
 * Central registry of every localStorage key used by the app.
 *
 * Using a constant prevents silent failures from typos — a missing or
 * misspelled key produces a TypeScript error here rather than a mystery
 * bug at runtime.  All reads/writes throughout the codebase should
 * reference SK.<NAME> instead of a raw string.
 */
export const SK = {
  // ── Editor settings ──────────────────────────────────────────────────────
  AUTO_SAVE:             "codrift:autoSave",
  TAB_SIZE:              "codrift:tabSize",
  FONT_SIZE:             "codrift:fontSize",
  WORD_WRAP:             "codrift:wordWrap",
  MINIMAP:               "codrift:minimap",
  INDENT_GUIDES:         "codrift:indentGuides",
  STICKY_SCROLL:         "codrift:stickyScroll",
  INLAY_HINTS:           "codrift:inlayHints",
  CODE_ACTIONS:          "codrift:codeActions",
  DIFF_EDITOR:           "codrift:diffEditor",
  INLINE_COMPLETIONS:    "codrift:inlineCompletions",
  SEMANTIC_HIGHLIGHTING: "codrift:semanticHighlighting",
  FORMAT_ON_SAVE:        "codrift:formatOnSave",
  BRACKET_PAIRS:         "codrift:bracketPairs",
  RULERS:                "codrift:rulers",
  MOUSE_WHEEL_ZOOM:      "codrift:mouseWheelZoom",

  // ── Layout / UI ───────────────────────────────────────────────────────────
  LAYOUT_MODE:           "codrift:layoutMode",
  FOCUS_MODE:            "codrift:focusMode",
  AI_PANEL_WIDTH:        "codrift:aiPanelWidth",

  // ── Workspace ─────────────────────────────────────────────────────────────
  WORKSPACE_SNAPSHOT:    "codrift:workspace-snapshot",
  WORKSPACE_OVERRIDES:   "codrift:workspace-overrides",
  RECENT_WORKSPACES:     "codrift:recent-workspaces",

  // ── Terminal ──────────────────────────────────────────────────────────────
  TERMINAL_PROFILE:      "codrift:terminal-profile",

  // ── Appearance ────────────────────────────────────────────────────────────
  THEME:                 "blink-theme",
  CUSTOM_THEME:          "codrift:custom-theme",

  // ── Keyboard / bindings ───────────────────────────────────────────────────
  KEYBINDINGS:           "codrift:keybindings",
  KEYMAP:                "codrift:keymap",

  // ── App behaviour ─────────────────────────────────────────────────────────
  CONFIRM_QUIT:          "codrift:confirmQuit",
  UPDATE_DISMISSED:      "codrift:update-dismissed",

  // ── Search / history ─────────────────────────────────────────────────────
  SEARCH_HISTORY:        "codrift:search-history",
  RECENT_COMMANDS:       "codrift:recent-commands",
} as const;

export type StorageKey = (typeof SK)[keyof typeof SK];
