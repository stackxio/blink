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

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LspWorkspaceEdit {
  changes?: Record<string, Array<{ range: LspRange; newText: string }>>;
  documentChanges?: Array<{
    textDocument: { uri: string };
    edits: Array<{ range: LspRange; newText: string }>;
  }>;
}

function convertWorkspaceEdit(monacoApi: any, lspEdit: LspWorkspaceEdit): any {
  const edits: any[] = [];
  for (const [uri, textEdits] of Object.entries(lspEdit.changes ?? {})) {
    const resource = monacoApi.Uri.parse(uri);
    for (const edit of textEdits) {
      edits.push({
        resource,
        textEdit: {
          range: new monacoApi.Range(
            edit.range.start.line + 1,
            edit.range.start.character + 1,
            edit.range.end.line + 1,
            edit.range.end.character + 1,
          ),
          text: edit.newText,
        },
        versionId: undefined,
      });
    }
  }
  for (const change of lspEdit.documentChanges ?? []) {
    const resource = monacoApi.Uri.parse(change.textDocument.uri);
    for (const edit of change.edits) {
      edits.push({
        resource,
        textEdit: {
          range: new monacoApi.Range(
            edit.range.start.line + 1,
            edit.range.start.character + 1,
            edit.range.end.line + 1,
            edit.range.end.character + 1,
          ),
          text: edit.newText,
        },
        versionId: undefined,
      });
    }
  }
  return { edits };
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

export interface LspProviderOptions {
  semanticHighlighting?: boolean;
  keymap?: "vscode" | "jetbrains";
}

export function registerLspProviders(
  monacoApi: any,
  model: any,
  client: LspClient,
  onNavigate?: (filePath: string, line: number, col: number) => void,
  options?: LspProviderOptions,
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

  const signatureHelpDisposable = monacoApi.languages.registerSignatureHelpProvider(selector, {
    signatureHelpTriggerCharacters: ["(", ",", "<"],
    signatureHelpRetriggerCharacters: [","],
    provideSignatureHelp: async (_model: any, position: any) => {
      try {
        const result = (await client.signatureHelp(
          fileUri,
          position.lineNumber - 1,
          position.column - 1,
        )) as any;
        if (!result) return null;
        const sigs = (result.signatures ?? []).map((sig: any) => ({
          label: sig.label as string,
          documentation: sig.documentation
            ? {
                value:
                  typeof sig.documentation === "string"
                    ? sig.documentation
                    : (sig.documentation.value ?? ""),
              }
            : undefined,
          parameters: (sig.parameters ?? []).map((p: any) => ({
            label: p.label,
            documentation: p.documentation
              ? {
                  value:
                    typeof p.documentation === "string"
                      ? p.documentation
                      : (p.documentation.value ?? ""),
                }
              : undefined,
          })),
        }));
        return {
          value: {
            signatures: sigs,
            activeSignature: result.activeSignature ?? 0,
            activeParameter: result.activeParameter ?? 0,
          },
          dispose() {},
        };
      } catch {
        return null;
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
    provideDefinition: async (_model: any, position: any) => {
      try {
        const result = (await client.definition(
          fileUri,
          position.lineNumber - 1,
          position.column - 1,
        )) as LspLocation[] | LspLocation | null;
        if (!result) return [];
        const locations = Array.isArray(result) ? result : [result];
        return locations.map((loc) => ({
          uri: monacoApi.Uri.parse(loc.uri),
          range: {
            startLineNumber: loc.range.start.line + 1,
            startColumn: loc.range.start.character + 1,
            endLineNumber: (loc.range.end?.line ?? loc.range.start.line) + 1,
            endColumn: (loc.range.end?.character ?? loc.range.start.character) + 1,
          },
        }));
      } catch {
        return [];
      }
    },
  });

  // ── Code actions (lightbulb / Ctrl+.) ────────────────────────────────────────

  const codeActionDisposable = monacoApi.languages.registerCodeActionProvider(selector, {
    provideCodeActions: async (_model: any, range: any, context: any) => {
      try {
        const lspRange = {
          start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
          end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
        };
        const lspDiagnostics = (context.markers ?? []).map((m: any) => ({
          range: {
            start: { line: m.startLineNumber - 1, character: m.startColumn - 1 },
            end: { line: m.endLineNumber - 1, character: m.endColumn - 1 },
          },
          severity: ({ 8: 1, 4: 2, 2: 3, 1: 4 } as Record<number, number>)[m.severity] ?? 2,
          message: m.message as string,
          source: m.source as string | undefined,
        }));
        const rawActions = (await client.codeAction(fileUri, lspRange, {
          diagnostics: lspDiagnostics,
        })) as any[] | null;
        const actions = (rawActions ?? []).map((a: any) => ({
          title: a.title as string,
          kind: a.kind as string | undefined,
          edit: a.edit ? convertWorkspaceEdit(monacoApi, a.edit as LspWorkspaceEdit) : undefined,
          command: a.command,
          isPreferred: a.isPreferred as boolean | undefined,
          diagnostics: [],
        }));
        return { actions, dispose() {} };
      } catch {
        return { actions: [], dispose() {} };
      }
    },
  });

  // ── Rename symbol (F2) ────────────────────────────────────────────────────────

  const renameDisposable = monacoApi.languages.registerRenameProvider(selector, {
    provideRenameEdits: async (_model: any, position: any, newName: string) => {
      try {
        const result = (await client.rename(
          fileUri,
          position.lineNumber - 1,
          position.column - 1,
          newName,
        )) as LspWorkspaceEdit | null;
        if (!result) return { edits: [] };
        return convertWorkspaceEdit(monacoApi, result);
      } catch {
        return { edits: [] };
      }
    },
  });

  // ── Find references (Shift+F12) ───────────────────────────────────────────────

  const referencesDisposable = monacoApi.languages.registerReferenceProvider(selector, {
    provideReferences: async (_model: any, position: any) => {
      try {
        const result = (await client.references(
          fileUri,
          position.lineNumber - 1,
          position.column - 1,
        )) as LspLocation[] | null;
        return (result ?? []).map((loc) => ({
          uri: monacoApi.Uri.parse(loc.uri),
          range: new monacoApi.Range(
            loc.range.start.line + 1,
            loc.range.start.character + 1,
            (loc.range.end?.line ?? loc.range.start.line) + 1,
            (loc.range.end?.character ?? loc.range.start.character) + 1,
          ),
        }));
      } catch {
        return [];
      }
    },
  });

  // ── Linked editing (rename matching tag pair) ─────────────────────────────────

  const linkedEditingDisposable = monacoApi.languages.registerLinkedEditingRangeProvider
    ? monacoApi.languages.registerLinkedEditingRangeProvider(selector, {
        provideLinkedEditingRanges: async (_model: any, position: any) => {
          try {
            const result = (await client.linkedEditingRange(
              fileUri,
              position.lineNumber - 1,
              position.column - 1,
            )) as { ranges: LspRange[]; wordPattern?: string } | null;
            if (!result?.ranges?.length) return null;
            return {
              ranges: result.ranges.map(
                (r) =>
                  new monacoApi.Range(
                    r.start.line + 1,
                    r.start.character + 1,
                    r.end.line + 1,
                    r.end.character + 1,
                  ),
              ),
              wordPattern: result.wordPattern ? new RegExp(result.wordPattern) : undefined,
            };
          } catch {
            return null;
          }
        },
      })
    : null;

  // ── Semantic tokens ───────────────────────────────────────────────────────────
  // Uses the standard LSP token types / modifiers (LSP 3.17 spec).
  // Most language servers follow this ordering.

  const SEMANTIC_TOKEN_TYPES = [
    "namespace",
    "type",
    "class",
    "enum",
    "interface",
    "struct",
    "typeParameter",
    "parameter",
    "variable",
    "property",
    "enumMember",
    "event",
    "function",
    "method",
    "macro",
    "keyword",
    "modifier",
    "comment",
    "string",
    "number",
    "regexp",
    "operator",
    "decorator",
  ];

  const SEMANTIC_TOKEN_MODIFIERS = [
    "declaration",
    "definition",
    "readonly",
    "static",
    "deprecated",
    "abstract",
    "async",
    "modification",
    "documentation",
    "defaultLibrary",
  ];

  const semanticHighlightingEnabled = options?.semanticHighlighting !== false;
  const semanticTokensDisposable = semanticHighlightingEnabled
    ? monacoApi.languages.registerDocumentSemanticTokensProvider(selector, {
        getLegend() {
          return {
            tokenTypes: SEMANTIC_TOKEN_TYPES,
            tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
          };
        },
        async provideDocumentSemanticTokens() {
          try {
            const result = (await client.semanticTokensFull(fileUri)) as {
              data?: number[];
              resultId?: string;
            } | null;
            if (!result?.data) return null;
            return { data: new Uint32Array(result.data), resultId: result.resultId };
          } catch {
            return null;
          }
        },
        releaseDocumentSemanticTokens() {
          // nothing to release
        },
      })
    : null;

  // ── Inlay hints ───────────────────────────────────────────────────────────────

  const inlayHintsDisposable = monacoApi.languages.registerInlayHintsProvider(selector, {
    provideInlayHints: async (_model: any, range: any) => {
      try {
        const lspRange = {
          start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
          end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
        };
        const raw = (await client.inlayHints(fileUri, lspRange)) as any[] | { items: any[] } | null;
        const hints: any[] = Array.isArray(raw) ? raw : (raw?.items ?? []);
        return {
          hints: hints.map((h: any) => ({
            position: {
              lineNumber: (h.position.line as number) + 1,
              column: (h.position.character as number) + 1,
            },
            label:
              typeof h.label === "string"
                ? h.label
                : (h.label as Array<{ value: string }>).map((p) => p.value).join(""),
            kind:
              h.kind === 1
                ? monacoApi.languages.InlayHintKind?.Type
                : h.kind === 2
                  ? monacoApi.languages.InlayHintKind?.Parameter
                  : undefined,
            paddingLeft: h.paddingLeft as boolean | undefined,
            paddingRight: h.paddingRight as boolean | undefined,
          })),
          dispose() {},
        };
      } catch {
        return { hints: [], dispose() {} };
      }
    },
  });

  // ── Definition action (F12 / Cmd+Click / Alt+F12 peek) ───────────────────────

  async function navigateToDefinitionAt(line: number, col: number) {
    if (!onNavigate) return;
    try {
      const result = (await client.definition(fileUri, line - 1, col - 1)) as
        | LspLocation[]
        | LspLocation
        | null;
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
  }

  async function navigateToDefinition(editor: any) {
    const position = editor.getPosition();
    if (!position) return;
    await navigateToDefinitionAt(position.lineNumber, position.column);
  }

  const isJetBrains = options?.keymap === "jetbrains";

  const definitionAction = (
    editor: any,
    onPeek?: (pos: { line: number; col: number }, coords: { top: number; left: number }) => void,
  ) => {
    const goToDefinitionKeys = isJetBrains
      ? [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyB] // ⌘B
      : [monacoApi.KeyCode.F12, monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.F12];
    editor.addAction({
      id: `blink.go-to-definition.${fileUri}`,
      label: "Go to Definition",
      keybindings: goToDefinitionKeys,
      run: () => navigateToDefinition(editor),
    });
    const peekDefinitionKeys = isJetBrains
      ? [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyY] // ⌘Y
      : [monacoApi.KeyMod.Alt | monacoApi.KeyCode.F12];
    // Peek usages (GoLand-style floating panel)
    editor.addAction({
      id: `blink.peek-definition.${fileUri}`,
      label: "Peek Usages",
      keybindings: peekDefinitionKeys,
      run: () => {
        const position = editor.getPosition();
        if (!position || !onPeek) return;
        const coords = editor.getScrolledVisiblePosition(position);
        if (!coords) return;
        onPeek({ line: position.lineNumber, col: position.column }, coords);
      },
    });
    // Cmd+Click — show GoLand-style peek panel instead of navigating directly
    editor.onMouseDown((e: any) => {
      if (!e.event.metaKey && !e.event.ctrlKey) return;
      // MouseTargetType.CONTENT_TEXT = 6
      if (e.target.type !== 6) return;
      const pos = e.target.position;
      if (!pos) return;
      e.event.preventDefault();
      e.event.stopPropagation();
      if (onPeek) {
        const coords = editor.getScrolledVisiblePosition(pos);
        if (coords) {
          onPeek({ line: pos.lineNumber, col: pos.column }, coords);
          return;
        }
      }
      void navigateToDefinitionAt(pos.lineNumber, pos.column);
    });
  };

  return {
    definitionAction,
    dispose() {
      completionDisposable.dispose();
      signatureHelpDisposable.dispose();
      hoverDisposable.dispose();
      formatDisposable.dispose();
      definitionDisposable.dispose();
      codeActionDisposable.dispose();
      renameDisposable.dispose();
      referencesDisposable.dispose();
      linkedEditingDisposable?.dispose();
      semanticTokensDisposable?.dispose();
      inlayHintsDisposable.dispose();
    },
  };
}

// ── Find Usages (GoLand-style peek) ───────────────────────────────────────────

export interface UsageLocation {
  uri: string; // file:// URI
  path: string; // absolute path (uri without file://)
  line: number; // 1-based
  character: number; // 1-based
}

export async function findUsages(
  client: LspClient,
  fileUri: string,
  line: number, // 1-based
  col: number, // 1-based
): Promise<{ definition: UsageLocation | null; references: UsageLocation[] }> {
  const [defResult, refsResult] = await Promise.allSettled([
    client.definition(fileUri, line - 1, col - 1) as Promise<LspLocation[] | LspLocation | null>,
    client.references(fileUri, line - 1, col - 1) as Promise<LspLocation[] | null>,
  ]);

  const defRaw = defResult.status === "fulfilled" ? defResult.value : null;
  const defLoc = Array.isArray(defRaw) ? (defRaw[0] ?? null) : (defRaw as LspLocation | null);
  const definition: UsageLocation | null = defLoc
    ? {
        uri: defLoc.uri,
        path: defLoc.uri.replace(/^file:\/\//, ""),
        line: defLoc.range.start.line + 1,
        character: defLoc.range.start.character + 1,
      }
    : null;

  const refsRaw = refsResult.status === "fulfilled" ? (refsResult.value ?? []) : [];
  const references: UsageLocation[] = refsRaw.map((loc) => ({
    uri: loc.uri,
    path: loc.uri.replace(/^file:\/\//, ""),
    line: loc.range.start.line + 1,
    character: loc.range.start.character + 1,
  }));

  return { definition, references };
}
