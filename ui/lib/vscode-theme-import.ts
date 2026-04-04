/**
 * VS Code theme importer.
 *
 * Reads a VS Code `.json` theme (Color Theme format) and produces a
 * BlinkTheme by mapping:
 *   - `colors`      → BlinkThemeUi
 *   - `tokenColors` → BlinkThemeSyntax
 */

import type { BlinkTheme, BlinkThemeSyntax, BlinkThemeUi } from "./theme-schema";

// ── VS Code color key → BlinkThemeUi field ──────────────────────────────────

const UI_MAP: Array<[string[], keyof BlinkThemeUi]> = [
  [["editor.background"], "background"],
  [["editor.foreground"], "foreground"],
  [["sideBar.background", "panel.background"], "surface"],
  [["list.hoverBackground", "tab.activeBackground"], "surfaceRaised"],
  [["editorWidget.background", "quickInput.background"], "popover"],
  [["panel.border", "sideBar.border", "editorGroup.border"], "border"],
  [["input.background"], "input"],
  [["focusBorder", "button.background", "progressBar.background"], "accent"],
  [["button.foreground"], "accentFg"],
  [["disabledForeground", "tab.inactiveForeground"], "muted"],
  [["descriptionForeground", "input.placeholderForeground"], "mutedFg"],
  [["errorForeground", "editorError.foreground"], "danger"],
  [["terminal.ansiGreen", "gitDecoration.addedResourceForeground"], "success"],
  [["editorWarning.foreground", "list.warningForeground"], "warning"],
];

// ── VS Code TextMate scope → BlinkThemeSyntax field ─────────────────────────
// Each entry: [scope prefixes to match, BlinkThemeSyntax key]
// Ordered from most specific to least specific.

type ScopeEntry = [string[], keyof BlinkThemeSyntax];

const SCOPE_MAP: ScopeEntry[] = [
  // Keywords
  [
    [
      "keyword.control",
      "keyword.operator",
      "keyword.other",
      "keyword",
      "storage.type",
      "storage.modifier",
    ],
    "keyword",
  ],

  // Types
  [
    [
      "entity.name.type",
      "entity.name.class",
      "entity.name.interface",
      "support.type",
      "support.class",
      "meta.type.name",
    ],
    "type",
  ],

  // Functions
  [
    ["entity.name.function", "support.function", "meta.function-call", "variable.function"],
    "function",
  ],

  // Strings
  [["string.quoted", "string.template", "string"], "string"],
  [["string.regexp"], "regexp"],

  // Numbers
  [["constant.numeric", "constant.language.numeric"], "number"],

  // Builtins / constants
  [["constant.language", "support.constant", "variable.language.this", "constant"], "builtin"],

  // Comments
  [["comment.line", "comment.block", "comment"], "comment"],

  // Tags (HTML/JSX)
  [["entity.name.tag", "meta.tag"], "tag"],

  // Attributes
  [["entity.other.attribute-name"], "attrName"],
  [["string.quoted.double.html", "string.quoted.single.html", "meta.attribute.value"], "attrValue"],

  // Variables
  [["variable.other.constant", "variable.other.enummember"], "constant"],
  [["variable.other.property", "support.variable.property"], "property"],
  [["variable.other", "variable"], "variable"],

  // Punctuation
  [["punctuation", "meta.brace", "meta.delimiter"], "punctuation"],

  // Meta / annotations
  [["meta.decorator", "storage.type.annotation", "entity.name.tag.yaml"], "meta"],

  // Markdown headings / links
  [["markup.heading", "entity.name.section"], "heading"],
  [["markup.underline.link", "meta.link"], "link"],
];

// ── Helpers ─────────────────────────────────────────────────────────────────

interface VscodeTokenColor {
  name?: string;
  scope?: string | string[];
  settings?: { foreground?: string; background?: string; fontStyle?: string };
}

interface VscodeTheme {
  name?: string;
  type?: string;
  colors?: Record<string, string>;
  tokenColors?: VscodeTokenColor[];
  semanticTokenColors?: Record<string, string | { foreground?: string }>;
}

function scopeMatches(scope: string, prefixes: string[]): boolean {
  const s = scope.toLowerCase();
  return prefixes.some((p) => s === p || s.startsWith(p + ".") || s.startsWith(p + " "));
}

function mapUi(colors: Record<string, string>): BlinkThemeUi {
  const ui: BlinkThemeUi = {};
  for (const [keys, field] of UI_MAP) {
    for (const key of keys) {
      const val = colors[key];
      if (val && val !== "transparent") {
        (ui as Record<string, string>)[field] = val;
        break;
      }
    }
  }
  return ui;
}

function mapSyntax(tokenColors: VscodeTokenColor[]): BlinkThemeSyntax {
  const syntax: BlinkThemeSyntax = {};
  const assigned = new Set<keyof BlinkThemeSyntax>();

  for (const token of tokenColors) {
    const color = token.settings?.foreground;
    if (!color) continue;

    const scopes = Array.isArray(token.scope)
      ? token.scope
      : typeof token.scope === "string"
        ? token.scope.split(",").map((s) => s.trim())
        : [];

    for (const scope of scopes) {
      for (const [prefixes, field] of SCOPE_MAP) {
        if (!assigned.has(field) && scopeMatches(scope, prefixes)) {
          (syntax as Record<string, string>)[field] = color;
          assigned.add(field);
          break;
        }
      }
    }
  }

  return syntax;
}

// ── Public API ───────────────────────────────────────────────────────────────

export type ImportResult = { ok: true; theme: BlinkTheme } | { ok: false; error: string };

/**
 * Parse a VS Code theme JSON string and convert to a BlinkTheme.
 */
export function importVscodeTheme(json: string): ImportResult {
  let raw: VscodeTheme;
  try {
    // VS Code themes may contain comments — strip them
    const stripped = json.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    raw = JSON.parse(stripped);
  } catch {
    return { ok: false, error: "Invalid JSON — could not parse theme file." };
  }

  const name = raw.name || "Imported Theme";
  const type: "dark" | "light" =
    typeof raw.type === "string" && raw.type.toLowerCase().includes("light") ? "light" : "dark";

  const ui = raw.colors ? mapUi(raw.colors) : {};
  const syntax = raw.tokenColors ? mapSyntax(raw.tokenColors) : {};

  return { ok: true, theme: { name, type, ui, syntax } };
}

/**
 * Read a File object (from <input type="file">) and import it.
 */
export async function importVscodeThemeFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    return importVscodeTheme(text);
  } catch {
    return { ok: false, error: "Could not read file." };
  }
}
