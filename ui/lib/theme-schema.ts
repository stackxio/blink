/**
 * BlinkTheme — the portable theme format for Blink IDE.
 *
 * A theme JSON file can set any subset of these properties.
 * All color values must be valid CSS color strings.
 *
 * Example:
 * {
 *   "name": "My Theme",
 *   "type": "dark",
 *   "ui": { "background": "#1e1e2e", "accent": "#cba6f7" },
 *   "syntax": { "keyword": "#cba6f7", "string": "#a6e3a1" }
 * }
 */

export interface BlinkThemeUi {
  background?: string; // --c-bg
  foreground?: string; // --c-fg
  surface?: string; // --c-surface
  surfaceRaised?: string; // --c-surface-raised
  popover?: string; // --c-popover
  border?: string; // --c-border
  input?: string; // --c-input
  accent?: string; // --c-accent
  accentFg?: string; // --c-accent-fg
  muted?: string; // --c-muted
  mutedFg?: string; // --c-muted-fg
  danger?: string; // --c-danger
  success?: string; // --c-success
  warning?: string; // --c-warning
}

export interface BlinkThemeSyntax {
  keyword?: string; // --hl-keyword
  type?: string; // --hl-type
  function?: string; // --hl-function
  variable?: string; // --hl-variable
  property?: string; // --hl-property
  string?: string; // --hl-string
  stringSpecial?: string; // --hl-string-special
  number?: string; // --hl-number
  builtin?: string; // --hl-builtin
  comment?: string; // --hl-comment
  punctuation?: string; // --hl-punctuation
  tag?: string; // --hl-tag
  attrName?: string; // --hl-attr-name
  attrValue?: string; // --hl-attr-value
  regexp?: string; // --hl-regexp
  meta?: string; // --hl-meta
  constant?: string; // --hl-constant
  heading?: string; // --hl-heading
  link?: string; // --hl-link
}

export interface BlinkTheme {
  /** Human-readable name shown in UI */
  name: string;
  /** Base color scheme — controls which html class is applied */
  type: "dark" | "light";
  /** UI surface / chrome colors */
  ui?: BlinkThemeUi;
  /** Syntax token colors */
  syntax?: BlinkThemeSyntax;
}

// ── CSS variable mapping ────────────────────────────────────────────────────

export function blinkThemeToCssVars(theme: BlinkTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  const ui = theme.ui ?? {};
  if (ui.background) vars["--c-bg"] = ui.background;
  if (ui.foreground) vars["--c-fg"] = ui.foreground;
  if (ui.surface) vars["--c-surface"] = ui.surface;
  if (ui.surfaceRaised) vars["--c-surface-raised"] = ui.surfaceRaised;
  if (ui.popover) vars["--c-popover"] = ui.popover;
  if (ui.border) vars["--c-border"] = ui.border;
  if (ui.input) vars["--c-input"] = ui.input;
  if (ui.accent) vars["--c-accent"] = ui.accent;
  if (ui.accentFg) vars["--c-accent-fg"] = ui.accentFg;
  if (ui.muted) vars["--c-muted"] = ui.muted;
  if (ui.mutedFg) vars["--c-muted-fg"] = ui.mutedFg;
  if (ui.danger) vars["--c-danger"] = ui.danger;
  if (ui.success) vars["--c-success"] = ui.success;
  if (ui.warning) vars["--c-warning"] = ui.warning;

  const syn = theme.syntax ?? {};
  if (syn.keyword) vars["--hl-keyword"] = syn.keyword;
  if (syn.type) vars["--hl-type"] = syn.type;
  if (syn.function) vars["--hl-function"] = syn.function;
  if (syn.variable) vars["--hl-variable"] = syn.variable;
  if (syn.property) vars["--hl-property"] = syn.property;
  if (syn.string) vars["--hl-string"] = syn.string;
  if (syn.stringSpecial) vars["--hl-string-special"] = syn.stringSpecial;
  if (syn.number) vars["--hl-number"] = syn.number;
  if (syn.builtin) vars["--hl-builtin"] = syn.builtin;
  if (syn.comment) vars["--hl-comment"] = syn.comment;
  if (syn.punctuation) vars["--hl-punctuation"] = syn.punctuation;
  if (syn.tag) vars["--hl-tag"] = syn.tag;
  if (syn.attrName) vars["--hl-attr-name"] = syn.attrName;
  if (syn.attrValue) vars["--hl-attr-value"] = syn.attrValue;
  if (syn.regexp) vars["--hl-regexp"] = syn.regexp;
  if (syn.meta) vars["--hl-meta"] = syn.meta;
  if (syn.constant) vars["--hl-constant"] = syn.constant;
  if (syn.heading) vars["--hl-heading"] = syn.heading;
  if (syn.link) vars["--hl-link"] = syn.link;

  return vars;
}

/** JSON Schema (draft-07) for IDE tooling / validation */
export const BLINK_THEME_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "BlinkTheme",
  description: "Custom color theme for Blink IDE",
  type: "object",
  required: ["name", "type"],
  properties: {
    name: { type: "string", description: "Theme display name" },
    type: { type: "string", enum: ["dark", "light"], description: "Base color scheme" },
    ui: {
      type: "object",
      description: "UI chrome / surface colors (CSS color values)",
      properties: {
        background: { type: "string" },
        foreground: { type: "string" },
        surface: { type: "string" },
        surfaceRaised: { type: "string" },
        popover: { type: "string" },
        border: { type: "string" },
        input: { type: "string" },
        accent: { type: "string" },
        accentFg: { type: "string" },
        muted: { type: "string" },
        mutedFg: { type: "string" },
        danger: { type: "string" },
        success: { type: "string" },
        warning: { type: "string" },
      },
      additionalProperties: false,
    },
    syntax: {
      type: "object",
      description: "Syntax token colors",
      properties: {
        keyword: { type: "string" },
        type: { type: "string" },
        function: { type: "string" },
        variable: { type: "string" },
        property: { type: "string" },
        string: { type: "string" },
        stringSpecial: { type: "string" },
        number: { type: "string" },
        builtin: { type: "string" },
        comment: { type: "string" },
        punctuation: { type: "string" },
        tag: { type: "string" },
        attrName: { type: "string" },
        attrValue: { type: "string" },
        regexp: { type: "string" },
        meta: { type: "string" },
        constant: { type: "string" },
        heading: { type: "string" },
        link: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};
