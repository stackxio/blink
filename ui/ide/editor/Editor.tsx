import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import MergeConflictBar from "./MergeConflictBar";
import SymbolSearch from "./SymbolSearch";
import { LspClient } from "./lsp-client";
import { parseDiff } from "./git-gutter";
import { type ConflictRegion, findConflicts } from "./merge-conflicts";
import { applyLspDiagnostics, registerLspProviders } from "./monaco-lsp";
import { registerInlineCompletions } from "./monaco-inline-completions";
import {
  getLanguageId,
  getLspLanguageId,
  observeMonacoTheme,
  releaseModel,
  retainModel,
  setupMonaco,
} from "./monaco-setup";
import { useAppStore } from "@/store";
import { FileViewer, isViewableFile } from "./FileViewer";

interface Props {
  content: string;
  filename: string;
  filePath: string;
  initialCursorLine?: number;
  initialCursorCol?: number;
  initialScrollTop?: number;
  onSave: (content: string) => void;
  onChange: (modified: boolean) => void;
  onCursorChange?: (line: number, col: number, scrollTop: number) => void;
  onNavigate?: (filePath: string, line: number, col: number) => void;
  symbolSearchMode?: "document" | "workspace" | null;
  onSymbolSearchClose?: () => void;
}

interface FindState {
  open: boolean;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  matchCount: number;
  activeIndex: number;
}

interface InlineEditState {
  open: boolean;
  top: number;
  left: number;
  instruction: string;
  loading: boolean;
  selection: any | null;
  selectedText: string;
}

const DEFAULT_FIND_STATE: FindState = {
  open: false,
  query: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  matchCount: 0,
  activeIndex: 0,
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getStoredEditorOptions() {
  return {
    autoSave: localStorage.getItem("blink:autoSave") !== "false",
    tabSize: parseInt(localStorage.getItem("blink:tabSize") || "2", 10),
    minimap: localStorage.getItem("blink:minimap") !== "false",
    fontSize: parseInt(localStorage.getItem("blink:fontSize") || "13", 10),
    wordWrap: localStorage.getItem("blink:wordWrap") === "true",
    indentGuides: localStorage.getItem("blink:indentGuides") !== "false",
    stickyScroll: localStorage.getItem("blink:stickyScroll") !== "false",
    inlayHints: localStorage.getItem("blink:inlayHints") !== "false",
    codeActions: localStorage.getItem("blink:codeActions") !== "false",
    inlineCompletions: localStorage.getItem("blink:inlineCompletions") === "true",
    semanticHighlighting: localStorage.getItem("blink:semanticHighlighting") !== "false",
  };
}

function shouldUseExternalLsp(extension: string) {
  return !["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(extension);
}

function getFindMatches(
  model: any,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  regex: boolean,
) {
  if (!query) return [];
  const search = wholeWord && !regex ? `\\b${escapeRegExp(query)}\\b` : query;
  try {
    return model.findMatches(search, false, regex || wholeWord, caseSensitive, null, false);
  } catch {
    return [];
  }
}

function modelLineRange(monacoApi: any, model: any, startLine: number, endLine: number) {
  return new monacoApi.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
}

function getBlockText(monacoApi: any, model: any, fromLine: number, toLine: number) {
  if (toLine < fromLine) return "";
  return model.getValueInRange(modelLineRange(monacoApi, model, fromLine, toLine));
}

export default function Editor({
  content,
  filename,
  filePath,
  initialCursorLine,
  initialCursorCol,
  initialScrollTop,
  onSave,
  onChange,
  onCursorChange,
  onNavigate,
  symbolSearchMode,
  onSymbolSearchClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any | null>(null);
  const modelRef = useRef<any | null>(null);
  const monacoRef = useRef<any | null>(null);
  const savedContentRef = useRef(content);
  const latestContentRef = useRef(content);
  const lspClientRef = useRef<LspClient | null>(null);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const lastCursorSnapshotRef = useRef<{
    line: number;
    col: number;
    scrollTop: number;
  } | null>(null);
  const lastBlameKeyRef = useRef<string | null>(null);
  const blameCacheRef = useRef<
    Map<string, { author: string; date: string; summary: string } | null>
  >(new Map());
  const gitDecorationIdsRef = useRef<string[]>([]);
  const conflictDecorationIdsRef = useRef<string[]>([]);
  const findDecorationIdsRef = useRef<string[]>([]);
  const findMatchesRef = useRef<any[]>([]);
  const definitionActionRef = useRef<any | null>(null);
  const providersRef = useRef<{ dispose(): void } | null>(null);
  const themeCleanupRef = useRef<(() => void) | null>(null);
  const lspCleanupRef = useRef<(() => void) | null>(null);
  const staticCleanupRef = useRef<(() => void) | null>(null);
  const inlineCompletionDisposablesRef = useRef<Array<() => void>>([]);
  const currentFileUriRef = useRef<string | null>(null);
  const filePathRef = useRef(filePath);
  const workspacePathRef = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onNavigateRef = useRef(onNavigate);
  const findStateRef = useRef(DEFAULT_FIND_STATE);
  const inlineEditRef = useRef<InlineEditState>({
    open: false,
    top: 16,
    left: 16,
    instruction: "",
    loading: false,
    selection: null,
    selectedText: "",
  });
  const ws = useAppStore((s) => s.activeWorkspace());

  const [blameInfo, setBlameInfo] = useState<{
    author: string;
    date: string;
    summary: string;
  } | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRegion[]>([]);
  const [conflictIdx, setConflictIdx] = useState(0);
  const [findState, setFindState] = useState<FindState>(DEFAULT_FIND_STATE);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [fallbackValue, setFallbackValue] = useState(content);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({
    open: false,
    top: 16,
    left: 16,
    instruction: "",
    loading: false,
    selection: null,
    selectedText: "",
  });

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    findStateRef.current = findState;
  }, [findState]);

  useEffect(() => {
    inlineEditRef.current = inlineEdit;
  }, [inlineEdit]);

  useEffect(() => {
    latestContentRef.current = content;
    setFallbackValue(content);
  }, [content]);

  useEffect(() => {
    filePathRef.current = filePath;
    workspacePathRef.current = ws?.path ?? null;
  }, [filePath, ws?.path]);

  useEffect(() => {
    lastCursorSnapshotRef.current = null;
    lastBlameKeyRef.current = null;
    if (blameTimerRef.current) clearTimeout(blameTimerRef.current);
    setBlameInfo(null);
  }, [filePath]);

  const fileUri = `file://${filePath}`;

  const applyGitDecorations = useCallback(async () => {
    const editor = editorRef.current;
    const model = modelRef.current;
    const monacoApi = monacoRef.current;
    const wsPath = workspacePathRef.current;
    const currentFilePath = filePathRef.current;
    if (!editor || !model || !monacoApi || !wsPath || !currentFilePath.startsWith(wsPath)) return;
    const relPath = currentFilePath.slice(wsPath.length).replace(/^\//, "");
    try {
      const diff = await invoke<string>("git_diff", { path: wsPath, filePath: relPath });
      const changes = parseDiff(diff);
      const decorations = Array.from(changes.entries()).flatMap(([line, type]) => {
        if (line < 1 || line > model.getLineCount()) return [];
        return [
          {
            range: new monacoApi.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              linesDecorationsClassName: `monaco-git-change monaco-git-change--${type}`,
            },
          },
        ];
      });
      gitDecorationIdsRef.current = editor.deltaDecorations(
        gitDecorationIdsRef.current,
        decorations,
      );
    } catch {
      // Ignore diff lookup failures for non-git files.
    }
  }, []);

  const applyConflictDecorations = useCallback(() => {
    const editor = editorRef.current;
    const model = modelRef.current;
    const monacoApi = monacoRef.current;
    if (!editor || !model || !monacoApi) return;

    const nextConflicts = findConflicts(model.getValue());
    setConflicts(nextConflicts);
    setConflictIdx((current) => {
      if (nextConflicts.length === 0) return 0;
      return Math.min(current, nextConflicts.length - 1);
    });

    const decorations: any[] = [];
    for (const conflict of nextConflicts) {
      decorations.push({
        range: modelLineRange(monacoApi, model, conflict.oursStart, conflict.oursStart),
        options: { isWholeLine: true, className: "monaco-conflict-marker" },
      });
      decorations.push({
        range: modelLineRange(monacoApi, model, conflict.divider, conflict.divider),
        options: { isWholeLine: true, className: "monaco-conflict-marker" },
      });
      decorations.push({
        range: modelLineRange(monacoApi, model, conflict.theirsEnd, conflict.theirsEnd),
        options: { isWholeLine: true, className: "monaco-conflict-marker" },
      });
      if (conflict.oursToLine >= conflict.oursFromLine) {
        decorations.push({
          range: modelLineRange(monacoApi, model, conflict.oursFromLine, conflict.oursToLine),
          options: { isWholeLine: true, className: "monaco-conflict-ours" },
        });
      }
      if (conflict.theirsToLine >= conflict.theirsFromLine) {
        decorations.push({
          range: modelLineRange(monacoApi, model, conflict.theirsFromLine, conflict.theirsToLine),
          options: { isWholeLine: true, className: "monaco-conflict-theirs" },
        });
      }
    }

    conflictDecorationIdsRef.current = editor.deltaDecorations(
      conflictDecorationIdsRef.current,
      decorations,
    );
  }, []);

  const updateCursorState = useCallback(() => {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model) return;
    const position = editor.getPosition();
    if (!position) return;
    const nextSnapshot = {
      line: position.lineNumber,
      col: position.column,
      scrollTop: editor.getScrollTop(),
    };
    const previousSnapshot = lastCursorSnapshotRef.current;
    const cursorChanged =
      !previousSnapshot ||
      previousSnapshot.line !== nextSnapshot.line ||
      previousSnapshot.col !== nextSnapshot.col;
    const snapshotChanged =
      cursorChanged || !previousSnapshot || previousSnapshot.scrollTop !== nextSnapshot.scrollTop;

    if (snapshotChanged) {
      lastCursorSnapshotRef.current = nextSnapshot;
      onCursorChangeRef.current?.(nextSnapshot.line, nextSnapshot.col, nextSnapshot.scrollTop);
    }

    const wsPath = workspacePathRef.current;
    const currentFilePath = filePathRef.current;
    if (!cursorChanged || !wsPath) return;

    const blameKey = `${currentFilePath}:${nextSnapshot.line}`;
    lastBlameKeyRef.current = blameKey;

    const cached = blameCacheRef.current.get(blameKey);
    if (cached !== undefined) {
      setBlameInfo(cached);
      return;
    }

    if (blameTimerRef.current) clearTimeout(blameTimerRef.current);
    blameTimerRef.current = setTimeout(() => {
      invoke<{ author: string; date: string; summary: string } | null>("git_blame_line", {
        path: wsPath,
        filePath: currentFilePath,
        line: nextSnapshot.line,
      })
        .then((result) => {
          blameCacheRef.current.set(blameKey, result);
          if (lastBlameKeyRef.current === blameKey) {
            setBlameInfo(result);
          }
        })
        .catch(() => {
          blameCacheRef.current.set(blameKey, null);
          if (lastBlameKeyRef.current === blameKey) {
            setBlameInfo(null);
          }
        });
    }, 250);
  }, []);

  const closeInlineEdit = useCallback(() => {
    setInlineEdit((state) => ({
      ...state,
      open: false,
      loading: false,
      instruction: "",
      selection: null,
      selectedText: "",
    }));
    editorRef.current?.focus();
  }, []);

  const openInlineEdit = useCallback(() => {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model) return;
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return;

    const anchor = editor.getScrolledVisiblePosition(selection.getStartPosition());
    const layout = editor.getLayoutInfo();
    const selectedText = model.getValueInRange(selection);
    setInlineEdit({
      open: true,
      loading: false,
      instruction: "",
      selection,
      selectedText,
      top: (anchor?.top ?? 8) + 26,
      left: Math.min((anchor?.left ?? 12) + layout.contentLeft, layout.width - 320),
    });
  }, []);

  const updateFindDecorations = useCallback((matches: any[], activeIndex: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const decorations = matches.map((match, index) => ({
      range: match.range,
      options: {
        inlineClassName:
          index === activeIndex
            ? "monaco-find-match monaco-find-match--active"
            : "monaco-find-match",
      },
    }));
    findDecorationIdsRef.current = editor.deltaDecorations(
      findDecorationIdsRef.current,
      decorations,
    );
  }, []);

  const refreshFind = useCallback(
    (patch?: Partial<FindState>, reveal = false) => {
      const model = modelRef.current;
      const editor = editorRef.current;
      if (!model || !editor) return;

      const next = { ...findStateRef.current, ...patch };
      if (!next.open || !next.query) {
        findMatchesRef.current = [];
        findDecorationIdsRef.current = editor.deltaDecorations(findDecorationIdsRef.current, []);
        setFindState({ ...next, matchCount: 0, activeIndex: 0 });
        return;
      }

      const matches = getFindMatches(
        model,
        next.query,
        next.caseSensitive,
        next.wholeWord,
        next.regex,
      );
      findMatchesRef.current = matches;
      const activeIndex = matches.length === 0 ? 0 : Math.min(next.activeIndex, matches.length - 1);
      updateFindDecorations(matches, activeIndex);
      setFindState({ ...next, matchCount: matches.length, activeIndex });

      if (reveal && matches[activeIndex]) {
        editor.setSelection(matches[activeIndex].range);
        editor.revealRangeInCenterIfOutsideViewport(matches[activeIndex].range);
      }
    },
    [updateFindDecorations],
  );

  const moveFindSelection = useCallback(
    (direction: 1 | -1) => {
      const matches = findMatchesRef.current;
      if (matches.length === 0) return;
      const nextIndex =
        direction === 1
          ? (findStateRef.current.activeIndex + 1) % matches.length
          : (findStateRef.current.activeIndex - 1 + matches.length) % matches.length;
      refreshFind({ activeIndex: nextIndex }, true);
    },
    [refreshFind],
  );

  useEffect(() => {
    if (!editorHostRef.current) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      try {
        const monacoApi = await setupMonaco();
        if (cancelled || !editorHostRef.current) return;
        monacoRef.current = monacoApi;
        setEditorError(null);

        let editor = editorRef.current;
        if (!editor) {
          const opts = getStoredEditorOptions();
          editor = monacoApi.editor.create(editorHostRef.current, {
            automaticLayout: true,
            theme: "blink",
            fontFamily: "var(--font-mono)",
            fontSize: opts.fontSize,
            lineHeight: Math.round(opts.fontSize * 1.6),
            lineNumbers: "on",
            lineNumbersMinChars: 4,
            minimap: { enabled: opts.minimap },
            wordWrap: opts.wordWrap ? "on" : "off",
            tabSize: opts.tabSize,
            insertSpaces: true,
            glyphMargin: false,
            folding: true,
            roundedSelection: false,
            scrollBeyondLastLine: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            renderLineHighlight: "all",
            padding: { top: 8, bottom: 8 },
            bracketPairColorization: { enabled: false },
            matchBrackets: "always",
            guides: {
              indentation: opts.indentGuides,
              highlightActiveIndentation: false,
              bracketPairs: false,
            },
            suggest: { preview: true, showWords: false },
            quickSuggestions: true,
            stickyScroll: { enabled: opts.stickyScroll },
            lightbulb: { enabled: opts.codeActions ? ("on" as const) : ("off" as const) },
            inlayHints: { enabled: opts.inlayHints ? ("on" as const) : ("off" as const) },
          });
          editorRef.current = editor;
          const bootModel = editor.getModel();
          if (bootModel) {
            editor.setModel(null);
            bootModel.dispose();
          }

          const cursorDisposable = editor.onDidChangeCursorPosition(() => {
            updateCursorState();
            if (inlineEditRef.current.open) {
              closeInlineEdit();
            }
          });

          const scrollDisposable = editor.onDidScrollChange(() => {
            if (scrollFrameRef.current != null) return;
            scrollFrameRef.current = window.requestAnimationFrame(() => {
              scrollFrameRef.current = null;
              updateCursorState();
            });
          });

          const blurDisposable = editor.onDidBlurEditorWidget(() => {
            if (!getStoredEditorOptions().autoSave) return;
            const currentModel = modelRef.current;
            if (currentModel && currentModel.getValue() !== savedContentRef.current) {
              const text = currentModel.getValue();
              onSaveRef.current(text);
              savedContentRef.current = text;
              onChangeRef.current(false);
              if (currentFileUriRef.current) {
                lspClientRef.current?.didSave(currentFileUriRef.current, text);
              }
              void applyGitDecorations();
            }
          });

          editor.addAction({
            id: "blink.save",
            label: "Save",
            keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS],
            run: () => {
              const currentModel = modelRef.current;
              if (!currentModel) return;
              const text = currentModel.getValue();
              onSaveRef.current(text);
              savedContentRef.current = text;
              onChangeRef.current(false);
              if (currentFileUriRef.current) {
                lspClientRef.current?.didSave(currentFileUriRef.current, text);
              }
              void applyGitDecorations();
            },
          });

          editor.addAction({
            id: "blink.find",
            label: "Find",
            keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyF],
            run: () => {
              const currentModel = modelRef.current;
              if (!currentModel) return;
              const selection = editor.getSelection();
              const nextQuery =
                selection && !selection.isEmpty()
                  ? currentModel.getValueInRange(selection).trim()
                  : findStateRef.current.query;
              setFindState((state) => ({
                ...state,
                open: true,
                query: nextQuery,
                activeIndex: 0,
              }));
            },
          });

          editor.addAction({
            id: "blink.goto-line",
            label: "Go to Line",
            keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyG],
            run: async () => {
              await editor.getAction("editor.action.gotoLine")?.run();
            },
          });

          editor.addAction({
            id: "blink.format",
            label: "Format Document",
            keybindings: [
              monacoApi.KeyMod.CtrlCmd | monacoApi.KeyMod.Shift | monacoApi.KeyCode.KeyF,
            ],
            run: async () => {
              await editor.getAction("editor.action.formatDocument")?.run();
            },
          });

          editor.addAction({
            id: "blink.inline-edit",
            label: "Inline Edit",
            keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyK],
            run: () => openInlineEdit(),
          });

          themeCleanupRef.current = observeMonacoTheme(monacoApi, () => {
            editor.updateOptions({});
          });

          if (opts.inlineCompletions) {
            inlineCompletionDisposablesRef.current = registerInlineCompletions(monacoApi);
          }

          const onStorageChange = (e: StorageEvent) => {
            if (!editorRef.current || !modelRef.current) return;
            if (e.key === "blink:wordWrap") {
              editorRef.current.updateOptions({ wordWrap: e.newValue === "true" ? "on" : "off" });
            } else if (e.key === "blink:minimap") {
              editorRef.current.updateOptions({ minimap: { enabled: e.newValue !== "false" } });
            } else if (e.key === "blink:indentGuides") {
              editorRef.current.updateOptions({
                guides: {
                  indentation: e.newValue === "true",
                  highlightActiveIndentation: false,
                  bracketPairs: false,
                },
              });
            } else if (e.key === "blink:fontSize") {
              const fontSize = parseInt(e.newValue ?? "13", 10);
              editorRef.current.updateOptions({
                fontSize,
                lineHeight: Math.round(fontSize * 1.6),
              });
            } else if (e.key === "blink:tabSize") {
              const tabSize = parseInt(e.newValue ?? "2", 10);
              modelRef.current.updateOptions({ tabSize, insertSpaces: true });
              editorRef.current.updateOptions({ tabSize });
            } else if (e.key === "blink:stickyScroll") {
              editorRef.current.updateOptions({
                stickyScroll: { enabled: e.newValue !== "false" },
              });
            } else if (e.key === "blink:inlayHints") {
              editorRef.current.updateOptions({
                inlayHints: {
                  enabled: e.newValue !== "false" ? ("on" as const) : ("off" as const),
                },
              });
            } else if (e.key === "blink:codeActions") {
              editorRef.current.updateOptions({
                lightbulb: {
                  enabled: e.newValue !== "false" ? ("on" as const) : ("off" as const),
                },
              });
            } else if (e.key === "blink:inlineCompletions") {
              const enable = e.newValue === "true";
              // Dispose existing
              for (const dispose of inlineCompletionDisposablesRef.current) dispose();
              inlineCompletionDisposablesRef.current = [];
              // Register if enabling
              if (enable && monacoRef.current) {
                inlineCompletionDisposablesRef.current = registerInlineCompletions(
                  monacoRef.current,
                );
              }
            }
          };
          window.addEventListener("storage", onStorageChange);

          staticCleanupRef.current = () => {
            window.removeEventListener("storage", onStorageChange);
            if (blameTimerRef.current) clearTimeout(blameTimerRef.current);
            if (scrollFrameRef.current != null) window.cancelAnimationFrame(scrollFrameRef.current);
            themeCleanupRef.current?.();
            for (const dispose of inlineCompletionDisposablesRef.current) dispose();
            inlineCompletionDisposablesRef.current = [];
            cursorDisposable.dispose();
            scrollDisposable.dispose();
            blurDisposable.dispose();
            editor.dispose();
            editorRef.current = null;
            monacoRef.current = null;
          };
        }

        const language = getLanguageId(filename);
        const initialContent = latestContentRef.current;
        const model = retainModel(monacoApi, fileUri, initialContent, language);
        modelRef.current = model;
        currentFileUriRef.current = fileUri;
        savedContentRef.current = initialContent;
        model.updateOptions({ tabSize: getStoredEditorOptions().tabSize, insertSpaces: true });
        editor.setModel(model);

        if (model.getValue() !== latestContentRef.current) {
          model.setValue(latestContentRef.current);
          savedContentRef.current = latestContentRef.current;
        }

        if (initialCursorLine && initialCursorLine > 0) {
          const lineNumber = Math.min(initialCursorLine, model.getLineCount());
          const column = Math.min(initialCursorCol || 1, model.getLineMaxColumn(lineNumber));
          editor.setPosition({ lineNumber, column });
          editor.revealPosition({ lineNumber, column });
          if (initialScrollTop) {
            requestAnimationFrame(() => {
              editor.setScrollTop(initialScrollTop);
            });
          }
        } else {
          editor.setScrollTop(initialScrollTop || 0);
        }

        const ext = filename.split(".").pop()?.toLowerCase() || "";
        if (shouldUseExternalLsp(ext)) {
          const lspClient = new LspClient();
          lspClientRef.current = lspClient;

          lspClient
            .start(ext, workspacePathRef.current)
            .then((langId) => {
              if (!langId || modelRef.current?.uri.toString() !== fileUri) return;
              setTimeout(() => {
                if (modelRef.current?.uri.toString() !== fileUri) return;
                lspClient.didOpen(fileUri, getLspLanguageId(filename), model.getValue());
              }, 550);

              lspCleanupRef.current = lspClient.onDiagnostics((uri, diagnostics) => {
                if (uri !== fileUri || modelRef.current?.uri.toString() !== uri) return;
                applyLspDiagnostics(monacoApi, model, diagnostics, (nextDiagnostics) => {
                  useAppStore.getState().setDiagnosticsForUri(
                    uri,
                    nextDiagnostics.map((d) => ({
                      uri,
                      severity: d.severity ?? 2,
                      message: d.message,
                      line: d.range.start.line,
                      character: d.range.start.character,
                    })),
                  );
                });
              });

              const providers = registerLspProviders(
                monacoApi,
                model,
                lspClient,
                (path, line, col) => {
                  onNavigateRef.current?.(path, line, col);
                },
                { semanticHighlighting: getStoredEditorOptions().semanticHighlighting },
              );
              providersRef.current = providers;
              definitionActionRef.current = providers.definitionAction(editor);
            })
            .catch(() => {});
        } else {
          lspClientRef.current = null;
          useAppStore.getState().setDiagnosticsForUri(fileUri, []);
        }

        const changeDisposable = model.onDidChangeContent(() => {
          const current = model.getValue();
          onChangeRef.current(current !== savedContentRef.current);
          if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
          changeTimerRef.current = setTimeout(() => {
            if (currentFileUriRef.current) {
              lspClientRef.current?.didChange(currentFileUriRef.current, current);
            }
          }, 500);
          applyConflictDecorations();
          if (findStateRef.current.open) refreshFind();
        });

        applyConflictDecorations();
        void applyGitDecorations();
        updateCursorState();

        cleanup = () => {
          if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
          lspClientRef.current?.didClose(fileUri);
          lspCleanupRef.current?.();
          lspCleanupRef.current = null;
          providersRef.current?.dispose();
          providersRef.current = null;
          definitionActionRef.current?.dispose();
          definitionActionRef.current = null;
          lspClientRef.current = null;
          gitDecorationIdsRef.current = editor.deltaDecorations(gitDecorationIdsRef.current, []);
          conflictDecorationIdsRef.current = editor.deltaDecorations(
            conflictDecorationIdsRef.current,
            [],
          );
          findDecorationIdsRef.current = editor.deltaDecorations(findDecorationIdsRef.current, []);
          changeDisposable.dispose();
          if (editor.getModel() === model) {
            editor.setModel(null);
          }
          modelRef.current = null;
          currentFileUriRef.current = null;
          useAppStore.getState().setDiagnosticsForUri(fileUri, []);
          releaseModel(monacoApi, fileUri);
        };
      } catch (error) {
        console.error("Failed to initialize Monaco editor", error);
        setEditorError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- switch models only when file identity changes
  }, [filename, filePath]);

  useEffect(() => {
    return () => {
      staticCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    if (model.getValue() !== content) {
      model.setValue(content);
      savedContentRef.current = content;
      onChangeRef.current(false);
      applyConflictDecorations();
      void applyGitDecorations();
    }
  }, [applyConflictDecorations, applyGitDecorations, content]);

  function handleFallbackSave() {
    onSaveRef.current(fallbackValue);
    savedContentRef.current = fallbackValue;
    onChangeRef.current(false);
  }

  useEffect(() => {
    if (findState.open) {
      refreshFind();
    }
  }, [
    findState.open,
    findState.query,
    findState.caseSensitive,
    findState.wholeWord,
    findState.regex,
    refreshFind,
  ]);

  function acceptOurs(conflict: ConflictRegion) {
    const editor = editorRef.current;
    const model = modelRef.current;
    const monacoApi = monacoRef.current;
    if (!editor || !model || !monacoApi) return;
    editor.executeEdits("blink-merge", [
      {
        range: modelLineRange(monacoApi, model, conflict.oursStart, conflict.theirsEnd),
        text: getBlockText(monacoApi, model, conflict.oursFromLine, conflict.oursToLine),
      },
    ]);
  }

  function acceptTheirs(conflict: ConflictRegion) {
    const editor = editorRef.current;
    const model = modelRef.current;
    const monacoApi = monacoRef.current;
    if (!editor || !model || !monacoApi) return;
    editor.executeEdits("blink-merge", [
      {
        range: modelLineRange(monacoApi, model, conflict.oursStart, conflict.theirsEnd),
        text: getBlockText(monacoApi, model, conflict.theirsFromLine, conflict.theirsToLine),
      },
    ]);
  }

  function acceptBoth(conflict: ConflictRegion) {
    const editor = editorRef.current;
    const model = modelRef.current;
    const monacoApi = monacoRef.current;
    if (!editor || !model || !monacoApi) return;
    const ours = getBlockText(monacoApi, model, conflict.oursFromLine, conflict.oursToLine);
    const theirs = getBlockText(monacoApi, model, conflict.theirsFromLine, conflict.theirsToLine);
    editor.executeEdits("blink-merge", [
      {
        range: modelLineRange(monacoApi, model, conflict.oursStart, conflict.theirsEnd),
        text: ours && theirs ? `${ours}\n${theirs}` : ours || theirs,
      },
    ]);
  }

  function navigateToConflict(index: number) {
    const editor = editorRef.current;
    const conflict = conflicts[index];
    if (!editor || !conflict) return;
    setConflictIdx(index);
    editor.setPosition({ lineNumber: conflict.oursStart, column: 1 });
    editor.revealLineInCenter(conflict.oursStart);
    editor.focus();
  }

  async function submitInlineEdit() {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model || !inlineEdit.selection || !inlineEdit.instruction.trim()) return;

    setInlineEdit((state) => ({ ...state, loading: true }));

    const prompt = `You are a code editor assistant. The user has selected the following code:\n\n\`\`\`\n${inlineEdit.selectedText}\n\`\`\`\n\nInstruction: ${inlineEdit.instruction}\n\nRespond with ONLY the replacement code. No explanation, no markdown fences, no extra text.`;

    try {
      let result = "";

      const unlistenChunk = await listen<{ chunk: string }>("chat:stream", (event) => {
        result += event.payload.chunk;
      });

      const completion = new Promise<boolean>(async (resolve) => {
        let unlistenDone = () => {};
        let unlistenError = () => {};

        unlistenDone = await listen<{ full_text: string }>("chat:done", (event) => {
          result = event.payload.full_text;
          unlistenDone();
          unlistenError();
          resolve(true);
        });
        unlistenError = await listen<{ error: string }>("chat:error", () => {
          result = "";
          unlistenDone();
          unlistenError();
          resolve(false);
        });
      });

      await invoke("chat_stream", {
        input: {
          prompt,
          threadId: null,
          runtimeMode: "full-access",
          provider: null,
          model: null,
        },
      });
      const ok = await completion;
      unlistenChunk();
      if (!ok) {
        setInlineEdit((state) => ({ ...state, loading: false }));
        return;
      }

      const cleaned = result
        .trim()
        .replace(/^```[\w]*\n?/, "")
        .replace(/\n?```$/, "");
      editor.executeEdits("blink-inline-edit", [
        {
          range: inlineEdit.selection,
          text: cleaned,
        },
      ]);
      closeInlineEdit();
    } catch {
      setInlineEdit((state) => ({ ...state, loading: false }));
    }
  }

  if (isViewableFile(filename)) {
    return <FileViewer filePath={filePath} filename={filename} content={content} />;
  }

  return (
    <div className="editor-pane" ref={containerRef} style={{ position: "relative" }}>
      {conflicts.length > 0 && (
        <MergeConflictBar
          conflicts={conflicts}
          currentIndex={conflictIdx}
          onAcceptOurs={acceptOurs}
          onAcceptTheirs={acceptTheirs}
          onAcceptBoth={acceptBoth}
          onNavigate={navigateToConflict}
        />
      )}

      {findState.open && (
        <div className="blink-search">
          <div className="blink-search__row">
            <input
              type="text"
              className="blink-search__input"
              placeholder="Find"
              spellCheck={false}
              autoCorrect="off"
              value={findState.query}
              onChange={(e) =>
                setFindState((state) => ({ ...state, query: e.target.value, activeIndex: 0 }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  moveFindSelection(e.shiftKey ? -1 : 1);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setFindState(DEFAULT_FIND_STATE);
                  findDecorationIdsRef.current =
                    editorRef.current?.deltaDecorations(findDecorationIdsRef.current, []) ?? [];
                  editorRef.current?.focus();
                }
              }}
              autoFocus
            />
            <span className="blink-search__count">
              {findState.matchCount === 0
                ? "No matches"
                : `${findState.activeIndex + 1} / ${findState.matchCount}`}
            </span>
            <div className="blink-search__toggles">
              <button
                className={`blink-search__toggle ${findState.caseSensitive ? "blink-search__toggle--on" : ""}`}
                onClick={() =>
                  setFindState((state) => ({
                    ...state,
                    caseSensitive: !state.caseSensitive,
                    activeIndex: 0,
                  }))
                }
                title="Match Case"
                type="button"
              >
                Aa
              </button>
              <button
                className={`blink-search__toggle ${findState.wholeWord ? "blink-search__toggle--on" : ""}`}
                onClick={() =>
                  setFindState((state) => ({
                    ...state,
                    wholeWord: !state.wholeWord,
                    activeIndex: 0,
                  }))
                }
                title="Whole Word"
                type="button"
              >
                ab
              </button>
              <button
                className={`blink-search__toggle ${findState.regex ? "blink-search__toggle--on" : ""}`}
                onClick={() =>
                  setFindState((state) => ({ ...state, regex: !state.regex, activeIndex: 0 }))
                }
                title="Regex"
                type="button"
              >
                .*
              </button>
            </div>
            <button
              className="blink-search__btn"
              onClick={() => moveFindSelection(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              className="blink-search__btn"
              onClick={() => moveFindSelection(1)}
              type="button"
            >
              ›
            </button>
            <button
              className="blink-search__btn blink-search__btn--text"
              onClick={() => {
                setFindState(DEFAULT_FIND_STATE);
                findDecorationIdsRef.current =
                  editorRef.current?.deltaDecorations(findDecorationIdsRef.current, []) ?? [];
                editorRef.current?.focus();
              }}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {editorError ? (
        <div className="editor-pane__fallback-wrap">
          <div className="editor-pane__fallback-error">Monaco failed to load: {editorError}</div>
          <textarea
            className="editor-pane__fallback"
            value={fallbackValue}
            spellCheck={false}
            onChange={(e) => {
              const next = e.target.value;
              setFallbackValue(next);
              onChangeRef.current(next !== savedContentRef.current);
            }}
            onBlur={() => {
              if (getStoredEditorOptions().autoSave && fallbackValue !== savedContentRef.current) {
                handleFallbackSave();
              }
            }}
          />
        </div>
      ) : (
        <div ref={editorHostRef} className="editor-pane__monaco" />
      )}

      {inlineEdit.open && (
        <div className="monaco-inline-edit" style={{ top: inlineEdit.top, left: inlineEdit.left }}>
          <input
            className="monaco-inline-edit__input"
            value={inlineEdit.instruction}
            onChange={(e) => setInlineEdit((state) => ({ ...state, instruction: e.target.value }))}
            placeholder="Describe the change"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitInlineEdit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                closeInlineEdit();
              }
            }}
            autoFocus
          />
          <button
            type="button"
            className="monaco-inline-edit__action"
            onClick={() => void submitInlineEdit()}
            disabled={inlineEdit.loading || !inlineEdit.instruction.trim()}
          >
            {inlineEdit.loading ? "Applying…" : "Apply"}
          </button>
          <button type="button" className="monaco-inline-edit__cancel" onClick={closeInlineEdit}>
            Cancel
          </button>
        </div>
      )}

      {blameInfo && (
        <div className="editor-blame">
          {blameInfo.author}, {blameInfo.date} — {blameInfo.summary}
        </div>
      )}

      {symbolSearchMode && lspClientRef.current && (
        <SymbolSearch
          mode={symbolSearchMode}
          client={lspClientRef.current}
          fileUri={fileUri}
          onNavigate={(path, line, col) => onNavigateRef.current?.(path, line, col)}
          onClose={() => onSymbolSearchClose?.()}
        />
      )}
    </div>
  );
}
