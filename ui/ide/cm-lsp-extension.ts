/**
 * CodeMirror extensions that connect to LSP via lsp-client.ts.
 * Provides: diagnostics (lint), hover tooltips.
 * Autocomplete is added separately once LSP server confirms it's ready.
 */

import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { type EditorView } from "@codemirror/view";
import { type LspDiagnostic } from "./lsp-client";

/**
 * Subscribe to LSP diagnostics and push them into CodeMirror's lint system.
 */
export function lspDiagnosticsListener(
  view: EditorView,
  filePath: string,
  onDiagnostics: (cb: (uri: string, diags: LspDiagnostic[]) => void) => (() => void),
) {
  const uri = `file://${filePath}`;

  return onDiagnostics((diagUri, lspDiags) => {
    if (diagUri !== uri) return;

    try {
      const cmDiags: Diagnostic[] = lspDiags.map((d) => {
        const from = lineCharToPos(view, d.range.start.line, d.range.start.character);
        const to = lineCharToPos(view, d.range.end.line, d.range.end.character);
        return {
          from,
          to: Math.max(to, from + 1),
          severity: severityMap(d.severity),
          message: d.message,
          source: d.source,
        };
      });
      view.dispatch(setDiagnostics(view.state, cmDiags));
    } catch {
      // View may have been destroyed
    }
  });
}

function lineCharToPos(view: EditorView, line: number, char: number): number {
  const lineCount = view.state.doc.lines;
  if (line >= lineCount) return view.state.doc.length;
  const lineObj = view.state.doc.line(line + 1);
  return Math.min(lineObj.from + char, lineObj.to);
}

function severityMap(severity?: number): "error" | "warning" | "info" | "hint" {
  switch (severity) {
    case 1: return "error";
    case 2: return "warning";
    case 3: return "info";
    case 4: return "hint";
    default: return "warning";
  }
}
