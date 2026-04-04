import type { LspClient, LspDiagnostic } from "./lsp-client";

interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  sortText?: string;
}

interface LspHoverResult {
  contents:
    | string
    | { kind: string; value: string }
    | Array<string | { language: string; value: string } | { kind: string; value: string }>;
}

interface LspLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end?: { line: number; character: number };
  };
}

// Numeric enum values copied into plain objects so this module stays safe
// before Monaco is dynamically imported.
const MONACO_COMPLETION_KIND: Record<number, number> = {
  1: 18,
  2: 0,
  3: 1,
  4: 2,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
  10: 9,
  11: 10,
  12: 11,
  13: 12,
  14: 17,
  15: 27,
  16: 18,
  17: 19,
  18: 20,
  19: 21,
  20: 23,
  21: 16,
  22: 13,
  23: 22,
  24: 24,
  25: 25,
};

const MONACO_MARKER_SEVERITY: Record<number, number> = {
  1: 8,
  2: 4,
  3: 2,
  4: 1,
};

function hoverContentsToText(contents: LspHoverResult["contents"]): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((item) => {
        if (typeof item === "string") return item;
        if ("value" in item) return item.value;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if ("value" in contents) return contents.value;
  return "";
}

function modelLanguageSelector(model: any) {
  return [{ scheme: model.uri.scheme, pattern: model.uri.path, language: model.getLanguageId() }];
}

export function applyLspDiagnostics(
  monacoApi: any,
  model: any,
  diagnostics: LspDiagnostic[],
  onStoreUpdate?: (diagnostics: LspDiagnostic[]) => void,
) {
  const filteredDiagnostics = diagnostics.filter((d) => {
    const message = d.message.toLowerCase();
    if (message.includes("cannot use jsx unless the '--jsx' flag is provided")) return false;
    if (message.includes("did you mean to set the 'moduleresolution' option to 'nodenext'")) {
      return false;
    }
    return true;
  });

  monacoApi.editor.setModelMarkers(
    model,
    "blink-lsp",
    filteredDiagnostics.map((d) => ({
      severity: MONACO_MARKER_SEVERITY[d.severity ?? 2] ?? monacoApi.MarkerSeverity.Warning,
      message: d.message,
      source: d.source,
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
    })),
  );
  onStoreUpdate?.(filteredDiagnostics);
}

export function registerLspProviders(
  monacoApi: any,
  model: any,
  client: LspClient,
  onNavigate?: (filePath: string, line: number, col: number) => void,
) {
  const selector = modelLanguageSelector(model);
  const fileUri = model.uri.toString();

  const completionDisposable = monacoApi.languages.registerCompletionItemProvider(selector, {
    triggerCharacters: [".", ":", ">", '"', "'", "/", "@", "#", "$", "-"],
    provideCompletionItems: async (_model: any, position: any) => {
      try {
        const raw = (await client.completion(
          fileUri,
          position.lineNumber - 1,
          position.column - 1,
        )) as { items?: LspCompletionItem[] } | LspCompletionItem[] | null;
        const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
        return {
          suggestions: items.map((item) => ({
            label: item.label,
            kind: item.kind
              ? (MONACO_COMPLETION_KIND[item.kind] ?? monacoApi.languages.CompletionItemKind.Text)
              : monacoApi.languages.CompletionItemKind.Text,
            insertText: item.insertText ?? item.label,
            detail: item.detail,
            documentation:
              typeof item.documentation === "string"
                ? item.documentation
                : item.documentation?.value,
            sortText: item.sortText,
            range: undefined,
          })),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  const hoverDisposable = monacoApi.languages.registerHoverProvider(selector, {
    provideHover: async (_model: any, position: any) => {
      try {
        const result = (await client.hover(
          fileUri,
          position.lineNumber - 1,
          position.column - 1,
        )) as LspHoverResult | null;
        if (!result?.contents) return null;
        const text = hoverContentsToText(result.contents).trim();
        if (!text) return null;
        return {
          range: new monacoApi.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          ),
          contents: [{ value: text }],
        };
      } catch {
        return null;
      }
    },
  });

  const formatDisposable = monacoApi.languages.registerDocumentFormattingEditProvider(selector, {
    provideDocumentFormattingEdits: async () => {
      try {
        const edits = (await client.formatting(
          fileUri,
          model.getOptions().tabSize,
          model.getOptions().insertSpaces,
        )) as Array<{
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
          newText: string;
        }> | null;
        return (edits ?? []).map((edit) => ({
          range: new monacoApi.Range(
            edit.range.start.line + 1,
            edit.range.start.character + 1,
            edit.range.end.line + 1,
            edit.range.end.character + 1,
          ),
          text: edit.newText,
        }));
      } catch {
        return [];
      }
    },
  });

  const definitionDisposable = monacoApi.languages.registerDefinitionProvider(selector, {
    provideDefinition: async () => {
      try {
        // Return nothing here; Blink handles navigation via an editor action so
        // Monaco doesn't attempt to open foreign resources inside the standalone editor.
        return [];
      } catch {
        return [];
      }
    },
  });

  const definitionAction = (editor: any) =>
    editor.addAction({
      id: `blink.go-to-definition.${fileUri}`,
      label: "Go to Definition",
      keybindings: [monacoApi.KeyCode.F12, monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.F12],
      run: async () => {
        const position = editor.getPosition();
        if (!position || !onNavigate) return;
        try {
          const result = (await client.definition(
            fileUri,
            position.lineNumber - 1,
            position.column - 1,
          )) as LspLocation[] | LspLocation | null;
          const location = Array.isArray(result) ? result[0] : result;
          if (!location?.uri) return;
          onNavigate(
            location.uri.replace("file://", ""),
            location.range.start.line + 1,
            location.range.start.character + 1,
          );
        } catch {
          // Ignore provider errors.
        }
      },
    });

  return {
    definitionAction,
    dispose() {
      completionDisposable.dispose();
      hoverDisposable.dispose();
      formatDisposable.dispose();
      definitionDisposable.dispose();
    },
  };
}
