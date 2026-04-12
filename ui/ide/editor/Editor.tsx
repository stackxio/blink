import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import MergeConflictBar from "./MergeConflictBar";
import SymbolSearch from "./SymbolSearch";
import { LspClient } from "./lsp-client";
import { parseDiff } from "./git-gutter";
import { type ConflictRegion, findConflicts } from "./merge-conflicts";
import { applyLspDiagnostics, registerLspProviders, findUsages } from "./monaco-lsp";
import type { PeekData } from "./PeekPanel";
import PeekPanel from "./PeekPanel";
import { loadKeymap } from "@/lib/key-bindings";
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
  replaceOpen: boolean;
  replaceQuery: string;
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
  replaceOpen: false,
  replaceQuery: "",
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getStoredEditorOptions() {
  return {
    autoSave: localStorage.getItem("codrift:autoSave") !== "false",
    tabSize: parseInt(localStorage.getItem("codrift:tabSize") || "2", 10),
    minimap: localStorage.getItem("codrift:minimap") !== "false",
    fontSize: parseInt(localStorage.getItem("codrift:fontSize") || "13", 10),
    wordWrap: localStorage.getItem("codrift:wordWrap") === "true",
    indentGuides: localStorage.getItem("codrift:indentGuides") !== "false",
    stickyScroll: localStorage.getItem("codrift:stickyScroll") !== "false",
    inlayHints: localStorage.getItem("codrift:inlayHints") !== "false",
    codeActions: localStorage.getItem("codrift:codeActions") !== "false",
    inlineCompletions: localStorage.getItem("codrift:inlineCompletions") === "true",
    semanticHighlighting: localStorage.getItem("codrift:semanticHighlighting") !== "false",
    formatOnSave: localStorage.getItem("codrift:formatOnSave") === "true",
    bracketPairs: localStorage.getItem("codrift:bracketPairs") === "true",
    rulers: localStorage.getItem("codrift:rulers") === "true",
    mouseWheelZoom: localStorage.getItem("codrift:mouseWheelZoom") === "true",
  };
}

function trimTrailingWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
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
  const trimTrailingWhitespaceRef = useRef(false);
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

  const [peekPanel, setPeekPanel] = useState<{
    top: number;
    left: number;
    loading: boolean;
    data: PeekData | null;
  } | null>(null);

  const [renameWidget, setRenameWidget] = useState<{
    top: number;
    left: number;
    currentName: string;
  } | null>(null);

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

  // Reposition cursor when navigating to a definition in an already-open file.
  // (The mount effect only runs on file switch; this handles same-file and re-navigate.)
  const prevCursorLineRef = useRef(initialCursorLine);
  const prevCursorColRef = useRef(initialCursorCol);
  useEffect(() => {
    if (
      initialCursorLine === prevCursorLineRef.current &&
      initialCursorCol === prevCursorColRef.current
    )
      return;
    prevCursorLineRef.current = initialCursorLine;
    prevCursorColRef.current = initialCursorCol;
    if (!initialCursorLine || initialCursorLine <= 0) return;
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const lineNumber = Math.min(initialCursorLine, model.getLineCount());
    const column = Math.min(initialCursorCol || 1, model.getLineMaxColumn(lineNumber));
    editor.setPosition({ lineNumber, column });
    editor.revealPositionInCenterIfOutsideViewport({ lineNumber, column });
  }, [initialCursorLine, initialCursorCol]);

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

  const showPeekPanel = useCallback(
    async (pos: { line: number; col: number }, coords: { top: number; left: number }) => {
      const editor = editorRef.current;
      const model = modelRef.current;
      const client = lspClientRef.current;
      const fileUri = currentFileUriRef.current;
      if (!editor || !model || !client || !fileUri) return;

      // Get the word under cursor for the panel title
      const wordInfo = model.getWordAtPosition({ lineNumber: pos.line, column: pos.col });
      const symbolName = wordInfo?.word ?? "";

      // Show panel in loading state immediately
      setPeekPanel({ top: coords.top, left: coords.left, loading: true, data: null });

      try {
        const { definition, references } = await findUsages(client, fileUri, pos.line, pos.col);

        // Collect all unique file paths to read
        const pathsToRead = new Set<string>();
        if (definition) pathsToRead.add(definition.path);
        for (const ref of references) pathsToRead.add(ref.path);

        // Read all referenced files in parallel, extract line content
        const fileContents = new Map<string, string[]>();
        await Promise.all(
          [...pathsToRead].map(async (p) => {
            try {
              const text = await invoke<string>("read_file_content", { path: p });
              fileContents.set(p, text.split("\n"));
            } catch {
              fileContents.set(p, []);
            }
          }),
        );

        function lineText(path: string, line: number): string {
          const lines = fileContents.get(path);
          return lines?.[line - 1] ?? "";
        }

        // Definition with line text
        const defWithText = definition
          ? { ...definition, lineText: lineText(definition.path, definition.line) }
          : null;

        // Filter references that are NOT the definition
        const usageRefs = references.filter(
          (r) => !(definition && r.path === definition.path && r.line === definition.line),
        );

        // Group usages by file, build dirLabel from path
        const groupMap = new Map<string, typeof usageRefs>();
        for (const ref of usageRefs) {
          const arr = groupMap.get(ref.path) ?? [];
          arr.push(ref);
          groupMap.set(ref.path, arr);
        }

        const wsPath = workspacePathRef.current ?? "";
        const fileGroups = [...groupMap.entries()].map(([filePath, refs]) => {
          const parts = filePath.replace(/\\/g, "/").split("/");
          const fileName = parts[parts.length - 1] ?? filePath;
          const relFull =
            wsPath && filePath.startsWith(wsPath) ? filePath.slice(wsPath.length + 1) : filePath;
          const relParts = relFull.replace(/\\/g, "/").split("/");
          const dirLabel = relParts.slice(0, -1).join("/");
          return {
            filePath,
            fileName,
            dirLabel,
            usages: refs.map((r) => ({ ...r, lineText: lineText(r.path, r.line) })),
          };
        });

        // Build flat navigable items: def first, then refs in file-group order
        const flatItems: Array<{ path: string; line: number; col: number }> = [];
        if (defWithText) {
          flatItems.push({
            path: defWithText.path,
            line: defWithText.line,
            col: defWithText.character,
          });
        }
        for (const g of fileGroups) {
          for (const u of g.usages) {
            flatItems.push({ path: u.path, line: u.line, col: u.character });
          }
        }

        setPeekPanel({
          top: coords.top,
          left: coords.left,
          loading: false,
          data: {
            symbolName,
            definition: defWithText,
            fileGroups,
            totalUsages: usageRefs.length,
            flatItems,
          },
        });
      } catch {
        setPeekPanel(null);
      }
    },
    [],
  );

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

  function replaceOne() {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model || findMatchesRef.current.length === 0) return;
    const match = findMatchesRef.current[findStateRef.current.activeIndex];
    if (!match) return;
    editor.executeEdits("blink-replace", [
      { range: match.range, text: findStateRef.current.replaceQuery },
    ]);
    refreshFind();
  }

  function replaceAll() {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model || findMatchesRef.current.length === 0) return;
    const edits = findMatchesRef.current.map((m: any) => ({
      range: m.range,
      text: findStateRef.current.replaceQuery,
    }));
    editor.executeEdits("blink-replace-all", edits);
    refreshFind();
  }

  async function submitRename(newName: string) {
    const editor = editorRef.current;
    const client = lspClientRef.current;
    const fileUri = currentFileUriRef.current;
    if (!editor || !client || !fileUri || !newName.trim()) {
      setRenameWidget(null);
      return;
    }
    const pos = editor.getPosition();
    if (!pos) {
      setRenameWidget(null);
      return;
    }

    try {
      const result = (await (client as any).rename(
        fileUri,
        pos.lineNumber - 1,
        pos.column - 1,
        newName.trim(),
      )) as any;
      if (result?.changes) {
        for (const [uri, edits] of Object.entries(result.changes as Record<string, any[]>)) {
          const path = uri.replace(/^file:\/\//, "");
          try {
            const content = await invoke<string>("read_file_content", { path });
            const lines = content.split("\n");
            const sorted = [...edits].sort(
              (a, b) =>
                b.range.start.line - a.range.start.line ||
                b.range.start.character - a.range.start.character,
            );
            for (const edit of sorted) {
              const startLine = edit.range.start.line;
              const startChar = edit.range.start.character;
              const endLine = edit.range.end.line;
              const endChar = edit.range.end.character;
              if (startLine === endLine) {
                lines[startLine] =
                  lines[startLine].slice(0, startChar) +
                  edit.newText +
                  lines[startLine].slice(endChar);
              }
            }
            await invoke("write_file_content", { path, content: lines.join("\n") });
          } catch {}
        }
      }
      if (result?.documentChanges) {
        for (const change of result.documentChanges) {
          if (change.textDocument && change.edits) {
            const path = (change.textDocument.uri as string).replace(/^file:\/\//, "");
            try {
              const content = await invoke<string>("read_file_content", { path });
              const lines = content.split("\n");
              const sorted = [...change.edits].sort(
                (a: any, b: any) => b.range.start.line - a.range.start.line,
              );
              for (const edit of sorted as any[]) {
                const sl = edit.range.start.line;
                const sc = edit.range.start.character;
                const el = edit.range.end.line;
                const ec = edit.range.end.character;
                if (sl === el) {
                  lines[sl] = lines[sl].slice(0, sc) + edit.newText + lines[sl].slice(ec);
                }
              }
              await invoke("write_file_content", { path, content: lines.join("\n") });
            } catch {}
          }
        }
      }
    } catch {}
    setRenameWidget(null);
    editor.focus();
  }

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
            theme: "codrift",
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
            bracketPairColorization: { enabled: opts.bracketPairs },
            matchBrackets: "always",
            guides: {
              indentation: opts.indentGuides,
              highlightActiveIndentation: false,
              bracketPairs: opts.bracketPairs,
            },
            rulers: opts.rulers ? [{ column: 80, color: "rgba(128,128,128,0.2)" }, { column: 120, color: "rgba(128,128,128,0.12)" }] : [],
            mouseWheelZoom: opts.mouseWheelZoom,
            suggest: { preview: true, showWords: false },
            quickSuggestions: true,
            hover: { enabled: true, delay: 300, sticky: true },
            stickyScroll: { enabled: opts.stickyScroll },
            lightbulb: { enabled: opts.codeActions ? ("on" as const) : ("off" as const) },
            inlayHints: { enabled: opts.inlayHints ? ("on" as const) : ("off" as const) },
            linkedEditing: true,
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
              let text = currentModel.getValue();
              if (trimTrailingWhitespaceRef.current) {
                const trimmed = trimTrailingWhitespace(text);
                if (trimmed !== text) {
                  currentModel.setValue(trimmed);
                  text = trimmed;
                }
              }
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
            run: async () => {
              const currentModel = modelRef.current;
              if (!currentModel) return;
              // Format on save — runs before reading the final text
              if (getStoredEditorOptions().formatOnSave) {
                try {
                  await editor.getAction("editor.action.formatDocument")?.run();
                } catch {}
              }
              let text = currentModel.getValue();
              if (trimTrailingWhitespaceRef.current) {
                const trimmed = trimTrailingWhitespace(text);
                if (trimmed !== text) {
                  currentModel.setValue(trimmed);
                  text = trimmed;
                }
              }
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
            id: "blink.find-replace",
            label: "Find & Replace",
            keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyH],
            run: () => {
              setFindState((state) => ({ ...state, open: true, replaceOpen: true }));
            },
          });

          editor.addAction({
            id: "blink.rename-symbol",
            label: "Rename Symbol",
            keybindings: [monacoApi.KeyCode.F2],
            run: () => {
              const pos = editor.getPosition();
              const model = editor.getModel();
              if (!pos || !model) return;
              const word = model.getWordAtPosition(pos);
              if (!word) return;
              const coords = editor.getScrolledVisiblePosition(pos);
              if (!coords) return;
              setRenameWidget({
                top: coords.top + 22,
                left: coords.left,
                currentName: word.word,
              });
            },
          });

          {
            // ⌘L is Monaco's built-in "expand line selection" — only override it
            // in JetBrains mode where ⌘L means Go to Line. In VS Code mode keep ⌘G only.
            const isJetBrains = loadKeymap() === "jetbrains";
            editor.addAction({
              id: "blink.goto-line",
              label: "Go to Line",
              keybindings: isJetBrains
                ? [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyL]
                : [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyG],
              run: async () => {
                await editor.getAction("editor.action.gotoLine")?.run();
              },
            });
          }

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

          // Cursor position history — navigate back/forward through past cursor positions
          editor.addAction({
            id: "blink.navigate-back",
            label: "Navigate Back",
            keybindings: [monacoApi.KeyMod.Alt | monacoApi.KeyCode.LeftArrow],
            run: async () => {
              await editor.getAction("editor.action.navigateBack")?.run();
            },
          });

          editor.addAction({
            id: "blink.navigate-forward",
            label: "Navigate Forward",
            keybindings: [monacoApi.KeyMod.Alt | monacoApi.KeyCode.RightArrow],
            run: async () => {
              await editor.getAction("editor.action.navigateForward")?.run();
            },
          });

          editor.addAction({
            id: "blink.explain-code",
            label: "Explain with AI",
            contextMenuGroupId: "blink",
            contextMenuOrder: 1,
            run: () => {
              const selection = editor.getSelection();
              const model = editor.getModel();
              if (!selection || !model) return;
              const text = selection.isEmpty()
                ? model.getValue()
                : model.getValueInRange(selection);
              if (!text.trim()) return;
              document.dispatchEvent(
                new CustomEvent("blink:explain-code", {
                  detail: { code: text, filename: filePathRef.current?.split("/").pop() ?? "" },
                }),
              );
            },
          });

          editor.addAction({
            id: "blink.ask-ai",
            label: "Ask AI about this",
            contextMenuGroupId: "blink",
            contextMenuOrder: 2,
            keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyMod.Shift | monacoApi.KeyCode.KeyL],
            run: () => {
              const selection = editor.getSelection();
              const model = editor.getModel();
              if (!selection || !model) return;
              const text = selection.isEmpty() ? "" : model.getValueInRange(selection);
              document.dispatchEvent(
                new CustomEvent("blink:ask-ai", {
                  detail: { code: text, filename: filePathRef.current?.split("/").pop() ?? "" },
                }),
              );
            },
          });

          themeCleanupRef.current = observeMonacoTheme(monacoApi, () => {
            editor.updateOptions({});
          });

          if (opts.inlineCompletions) {
            inlineCompletionDisposablesRef.current = registerInlineCompletions(monacoApi);
          }

          const onStorageChange = (e: StorageEvent) => {
            if (!editorRef.current || !modelRef.current) return;
            if (e.key === "codrift:wordWrap") {
              editorRef.current.updateOptions({ wordWrap: e.newValue === "true" ? "on" : "off" });
            } else if (e.key === "codrift:minimap") {
              editorRef.current.updateOptions({ minimap: { enabled: e.newValue !== "false" } });
            } else if (e.key === "codrift:indentGuides") {
              editorRef.current.updateOptions({
                guides: {
                  indentation: e.newValue === "true",
                  highlightActiveIndentation: false,
                  bracketPairs: getStoredEditorOptions().bracketPairs,
                },
              });
            } else if (e.key === "codrift:fontSize") {
              const fontSize = parseInt(e.newValue ?? "13", 10);
              editorRef.current.updateOptions({
                fontSize,
                lineHeight: Math.round(fontSize * 1.6),
              });
            } else if (e.key === "codrift:tabSize") {
              const tabSize = parseInt(e.newValue ?? "2", 10);
              modelRef.current.updateOptions({ tabSize, insertSpaces: true });
              editorRef.current.updateOptions({ tabSize });
            } else if (e.key === "codrift:stickyScroll") {
              editorRef.current.updateOptions({
                stickyScroll: { enabled: e.newValue !== "false" },
              });
            } else if (e.key === "codrift:inlayHints") {
              editorRef.current.updateOptions({
                inlayHints: {
                  enabled: e.newValue !== "false" ? ("on" as const) : ("off" as const),
                },
              });
            } else if (e.key === "codrift:codeActions") {
              editorRef.current.updateOptions({
                lightbulb: {
                  enabled: e.newValue !== "false" ? ("on" as const) : ("off" as const),
                },
              });
            } else if (e.key === "codrift:inlineCompletions") {
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
            } else if (e.key === "codrift:bracketPairs") {
              const on = e.newValue === "true";
              editorRef.current.updateOptions({
                bracketPairColorization: { enabled: on },
                guides: {
                  indentation: getStoredEditorOptions().indentGuides,
                  highlightActiveIndentation: false,
                  bracketPairs: on,
                },
              });
            } else if (e.key === "codrift:rulers") {
              const on = e.newValue === "true";
              editorRef.current.updateOptions({
                rulers: on
                  ? [{ column: 80, color: "rgba(128,128,128,0.2)" }, { column: 120, color: "rgba(128,128,128,0.12)" }]
                  : [],
              });
            } else if (e.key === "codrift:mouseWheelZoom") {
              editorRef.current.updateOptions({ mouseWheelZoom: e.newValue === "true" });
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

        // Apply .editorconfig settings for this file
        invoke<{
          insert_spaces: boolean | null;
          tab_size: number | null;
          trim_trailing_whitespace: boolean | null;
          end_of_line: string | null;
        }>("read_editorconfig", { filePath: filePathRef.current })
          .then((cfg) => {
            // Guard: make sure this file is still the active model
            if (modelRef.current !== model) return;
            const opts: { tabSize?: number; insertSpaces?: boolean } = {};
            if (cfg.tab_size != null) opts.tabSize = cfg.tab_size;
            if (cfg.insert_spaces != null) opts.insertSpaces = cfg.insert_spaces;
            if (Object.keys(opts).length > 0) model.updateOptions(opts);
            if (cfg.end_of_line != null) {
              const eolMap: Record<string, number> = { lf: 0, crlf: 1, cr: 0 };
              const eolVal = eolMap[cfg.end_of_line];
              if (eolVal != null) model.setEOL(eolVal);
            }
            trimTrailingWhitespaceRef.current = cfg.trim_trailing_whitespace === true;
          })
          .catch(() => {
            trimTrailingWhitespaceRef.current = false;
          });

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
                {
                  semanticHighlighting: getStoredEditorOptions().semanticHighlighting,
                  keymap: loadKeymap(),
                },
              );
              providersRef.current = providers;
              definitionActionRef.current = providers.definitionAction(editor, (pos, coords) => {
                void showPeekPanel(pos, coords);
              });
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
            <button
              className={`blink-search__toggle ${findState.replaceOpen ? "blink-search__toggle--on" : ""}`}
              onClick={() =>
                setFindState((state) => ({ ...state, replaceOpen: !state.replaceOpen }))
              }
              title="Toggle Replace"
              type="button"
            >
              ⇄
            </button>
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
          {findState.replaceOpen && (
            <div className="blink-search__replace-row">
              <input
                type="text"
                className="blink-search__input"
                placeholder="Replace"
                spellCheck={false}
                autoCorrect="off"
                value={findState.replaceQuery}
                onChange={(e) =>
                  setFindState((state) => ({ ...state, replaceQuery: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setFindState(DEFAULT_FIND_STATE);
                    findDecorationIdsRef.current =
                      editorRef.current?.deltaDecorations(findDecorationIdsRef.current, []) ?? [];
                    editorRef.current?.focus();
                  }
                }}
              />
              <button className="blink-search__replace-btn" onClick={replaceOne} type="button">
                Replace
              </button>
              <button className="blink-search__replace-btn" onClick={replaceAll} type="button">
                Replace All
              </button>
            </div>
          )}
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

      {renameWidget && (
        <div
          className="monaco-rename-widget"
          style={{ top: renameWidget.top, left: Math.max(4, renameWidget.left) }}
        >
          <input
            className="monaco-rename-widget__input"
            defaultValue={renameWidget.currentName}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRename((e.target as HTMLInputElement).value);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setRenameWidget(null);
                editorRef.current?.focus();
              }
            }}
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}

      {peekPanel && (
        <PeekPanel
          top={peekPanel.top}
          left={peekPanel.left}
          loading={peekPanel.loading}
          data={peekPanel.data}
          onNavigate={(path, line, col) => {
            onNavigateRef.current?.(path, line, col);
          }}
          onClose={() => setPeekPanel(null)}
        />
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
