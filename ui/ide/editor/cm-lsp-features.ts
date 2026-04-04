/**
 * CodeMirror extensions powered by LSP:
 * - Completion source (replaces built-in autocompletion suggestions)
 * - Hover tooltip
 * - Go-to-definition keybinding (F12 / Mod-F12)
 * - Format document (Mod-Shift-f)
 */

import { autocompletion, type CompletionSource, type Completion } from "@codemirror/autocomplete";
import { hoverTooltip, type Tooltip, keymap } from "@codemirror/view";
import { type Extension } from "@codemirror/state";
import type { LspClient } from "./lsp-client";

// ── Completion ────────────────────────────────────────────────────────────────

interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  sortText?: string;
}

// Map LSP CompletionItemKind (1-25) to CodeMirror completion type labels
const LSP_KIND_MAP: Record<number, string> = {
  1: "text",
  2: "method",
  3: "function",
  4: "constructor",
  5: "field",
  6: "variable",
  7: "class",
  8: "interface",
  9: "module",
  10: "property",
  11: "unit",
  12: "value",
  13: "enum",
  14: "keyword",
  15: "snippet",
  16: "text",
  17: "color",
  18: "file",
  19: "reference",
  20: "folder",
  21: "enum",
  22: "constant",
  23: "class",
  24: "operator",
  25: "variable",
};

export function lspCompletionSource(client: LspClient, fileUri: string): CompletionSource {
  return async (context) => {
    const { state, pos, explicit } = context;
    if (!explicit && !context.matchBefore(/[\w.]/)) return null;

    const line = state.doc.lineAt(pos);
    const lineNum = line.number - 1; // LSP is 0-indexed
    const character = pos - line.from;

    try {
      const raw = (await client.completion(fileUri, lineNum, character)) as
        | {
            items?: LspCompletionItem[];
            isIncomplete?: boolean;
          }
        | LspCompletionItem[]
        | null;

      if (!raw) return null;

      const items: LspCompletionItem[] = Array.isArray(raw) ? raw : (raw.items ?? []);
      if (items.length === 0) return null;

      const options: Completion[] = items.map((item) => ({
        label: item.label,
        type: item.kind ? (LSP_KIND_MAP[item.kind] ?? "variable") : "variable",
        detail: item.detail ?? undefined,
        info:
          typeof item.documentation === "string"
            ? item.documentation
            : (item.documentation?.value ?? undefined),
        apply: item.insertText ?? item.label,
        boost: item.sortText ? undefined : 1,
      }));

      return { from: pos, options, validFor: /^[\w]*$/ };
    } catch {
      return null;
    }
  };
}

export function lspAutocompletion(client: LspClient, fileUri: string): Extension {
  return autocompletion({
    override: [lspCompletionSource(client, fileUri)],
    activateOnTyping: true,
    maxRenderedOptions: 50,
  });
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────

interface LspHoverResult {
  contents:
    | string
    | { kind: string; value: string }
    | Array<string | { language: string; value: string } | { kind: string; value: string }>;
  range?: unknown;
}

function hoverContentsToText(contents: LspHoverResult["contents"]): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((c) => {
        if (typeof c === "string") return c;
        if ("value" in c) return c.value;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if ("value" in contents) return contents.value;
  return "";
}

export function lspHoverTooltip(client: LspClient, fileUri: string) {
  return hoverTooltip(
    async (view, pos): Promise<Tooltip | null> => {
      const line = view.state.doc.lineAt(pos);
      const lineNum = line.number - 1;
      const character = pos - line.from;

      try {
        const result = (await client.hover(fileUri, lineNum, character)) as LspHoverResult | null;
        if (!result?.contents) return null;
        const text = hoverContentsToText(result.contents).trim();
        if (!text) return null;

        return {
          pos,
          above: true,
          create() {
            const dom = document.createElement("div");
            dom.className = "lsp-hover-tooltip";
            dom.textContent = text;
            return { dom };
          },
        };
      } catch {
        return null;
      }
    },
    { hoverTime: 400 },
  );
}

// ── Go-to-definition ──────────────────────────────────────────────────────────

interface LspLocation {
  uri: string;
  range: { start: { line: number; character: number } };
}

export function lspDefinitionKeymap(
  client: LspClient,
  fileUri: string,
  onNavigate: (filePath: string, line: number, col: number) => void,
) {
  return keymap.of([
    {
      key: "F12",
      run: (view) => {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const lineNum = line.number - 1;
        const character = pos - line.from;

        client
          .definition(fileUri, lineNum, character)
          .then((result) => {
            if (!result) return;
            const loc: LspLocation = Array.isArray(result) ? result[0] : (result as LspLocation);
            if (!loc?.uri) return;
            const path = loc.uri.replace("file://", "");
            onNavigate(path, loc.range.start.line + 1, loc.range.start.character + 1);
          })
          .catch(() => {});

        return true;
      },
    },
  ]);
}

// ── Format document ───────────────────────────────────────────────────────────

export function lspFormatKeymap(client: LspClient, fileUri: string, tabSize: number) {
  return keymap.of([
    {
      key: "Mod-Shift-f",
      run: (view) => {
        client
          .formatting(fileUri, tabSize, true)
          .then((edits) => {
            if (!edits || !Array.isArray(edits)) return;
            const changes = edits
              .map(
                (edit: {
                  range: {
                    start: { line: number; character: number };
                    end: { line: number; character: number };
                  };
                  newText: string;
                }) => {
                  const startLine = view.state.doc.line(edit.range.start.line + 1);
                  const from = startLine.from + edit.range.start.character;
                  const endLine = view.state.doc.line(edit.range.end.line + 1);
                  const to = endLine.from + edit.range.end.character;
                  return { from, to, insert: edit.newText };
                },
              )
              .filter((c) => c !== null);

            if (changes.length > 0) {
              view.dispatch({ changes });
            }
          })
          .catch(() => {});

        return true;
      },
    },
  ]);
}
