import { useEffect, useRef, useCallback, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, type Panel } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap, highlightSelectionMatches, SearchQuery, setSearchQuery, findNext, findPrevious, closeSearchPanel, gotoLine } from "@codemirror/search";
import { lintGutter } from "@codemirror/lint";
import { darkSyntaxHighlighting } from "./cm-theme";
import { LspClient } from "./lsp-client";
import { lspDiagnosticsListener } from "./cm-lsp-extension";
import { useAppStore } from "@/store";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { php } from "@codemirror/lang-php";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { vue } from "@codemirror/lang-vue";
import { sass } from "@codemirror/lang-sass";
import { less } from "@codemirror/lang-less";
import { wast } from "@codemirror/lang-wast";

function getLanguageExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js": case "jsx": case "mjs": case "cjs": return javascript({ jsx: true });
    case "ts": case "tsx": return javascript({ jsx: true, typescript: true });
    case "py": return python();
    case "rs": return rust();
    case "go": return go();
    case "java": return java();
    case "c": case "cpp": case "cc": case "cxx": case "h": case "hpp": return cpp();
    case "php": return php();
    case "html": case "htm": case "svelte": return html();
    case "vue": return vue();
    case "css": return css();
    case "scss": case "sass": return sass();
    case "less": return less();
    case "json": case "jsonc": return json();
    case "md": case "mdx": return markdown();
    case "xml": case "svg": case "plist": return xml();
    case "yaml": case "yml": return yaml();
    case "sql": return sql();
    case "wat": case "wast": return wast();
    default: return [];
  }
}

function createSearchPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "caret-search";
  dom.innerHTML = `
    <div class="caret-search__row">
      <input type="text" class="caret-search__input" placeholder="Find" spellcheck="false" autocorrect="off" />
      <div class="caret-search__toggles">
        <button class="caret-search__toggle" data-opt="case" title="Match Case">Aa</button>
        <button class="caret-search__toggle" data-opt="word" title="Whole Word">ab</button>
        <button class="caret-search__toggle" data-opt="regex" title="Regex">.*</button>
      </div>
      <button class="caret-search__btn" data-action="prev" title="Previous (Shift+Enter)">‹</button>
      <button class="caret-search__btn" data-action="next" title="Next (Enter)">›</button>
      <button class="caret-search__btn caret-search__btn--text" data-action="close">✕</button>
    </div>
  `;

  const input = dom.querySelector("input") as HTMLInputElement;
  let caseSensitive = false;
  let wholeWord = false;
  let regexp = false;

  function updateQuery() {
    const query = new SearchQuery({ search: input.value, caseSensitive, regexp, wholeWord });
    view.dispatch({ effects: setSearchQuery.of(query) });
  }

  dom.querySelectorAll(".caret-search__toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opt = (btn as HTMLElement).dataset.opt;
      if (opt === "case") { caseSensitive = !caseSensitive; }
      if (opt === "word") { wholeWord = !wholeWord; }
      if (opt === "regex") { regexp = !regexp; }
      btn.classList.toggle("caret-search__toggle--on");
      updateQuery();
    });
  });

  input.addEventListener("input", updateQuery);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) findPrevious(view);
      else findNext(view);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  });

  dom.querySelector('[data-action="next"]')?.addEventListener("click", () => findNext(view));
  dom.querySelector('[data-action="prev"]')?.addEventListener("click", () => findPrevious(view));
  dom.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    closeSearchPanel(view);
    view.focus();
  });

  return {
    dom,
    top: true,
    mount() { setTimeout(() => input.focus(), 0); },
  };
}

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
}

export default function Editor({ content, filename, filePath, initialCursorLine, initialCursorCol, initialScrollTop, onSave, onChange, onCursorChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const savedContentRef = useRef(content);
  const [blameInfo, setBlameInfo] = useState<{ author: string; date: string; summary: string } | null>(null);
  const blameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lspClientRef = useRef<LspClient | null>(null);
  const diagCleanupRef = useRef<(() => void) | null>(null);
  const ws = useAppStore((s) => s.activeWorkspace());

  const handleSave = useCallback(() => {
    if (viewRef.current) {
      const text = viewRef.current.state.doc.toString();
      onSave(text);
      savedContentRef.current = text;
      onChange(false);
      lspClientRef.current?.didSave(`file://${filePath}`, text);
    }
  }, [onSave, onChange, filePath]);

  useEffect(() => {
    if (!containerRef.current) return;

    const lang = getLanguageExtension(filename);
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    // Start LSP in background — doesn't block editor creation
    const lspClient = new LspClient();
    lspClientRef.current = lspClient;

    lspClient.start(ext, ws?.path ?? null).then((langId) => {
      if (langId && viewRef.current) {
        lspClient.didOpen(`file://${filePath}`, langId, content);
        diagCleanupRef.current = lspDiagnosticsListener(
          viewRef.current,
          filePath,
          (cb) => lspClient.onDiagnostics(cb),
        );
      }
    }).catch(() => {});

    // Debounced LSP didChange
    let changeTimer: ReturnType<typeof setTimeout> | null = null;
    let initialLoad = true;

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        foldGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        search({ top: true, createPanel: createSearchPanel }),
        darkSyntaxHighlighting,
        autocompletion(), // CM's built-in — no LSP override
        lintGutter(),
        ...(Array.isArray(lang) ? lang : [lang]),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
          indentWithTab,
          { key: "Mod-s", run: () => { handleSave(); return true; } },
          { key: "Mod-g", run: gotoLine },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (initialLoad) { initialLoad = false; return; }
            const current = update.state.doc.toString();
            onChange(current !== savedContentRef.current);
            if (changeTimer) clearTimeout(changeTimer);
            changeTimer = setTimeout(() => {
              lspClientRef.current?.didChange(`file://${filePath}`, current);
            }, 500);
          }
        }),
        // Track cursor position changes + fetch blame
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.geometryChanged) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            const scrollTop = update.view.scrollDOM.scrollTop;
            onCursorChange?.(line.number, pos - line.from + 1, scrollTop);
            // Debounced blame fetch
            if (blameTimerRef.current) clearTimeout(blameTimerRef.current);
            blameTimerRef.current = setTimeout(() => {
              if (ws?.path) {
                invoke<{ author: string; date: string; summary: string } | null>("git_blame_line", {
                  path: ws.path, filePath, line: line.number,
                }).then(setBlameInfo).catch(() => setBlameInfo(null));
              }
            }, 400);
          }
        }),
        // Auto-save on blur (focus loss)
        EditorView.domEventHandlers({
          blur: (_event, view) => {
            const current = view.state.doc.toString();
            if (current !== savedContentRef.current) {
              handleSave();
            }
          },
        }),
        EditorView.theme({ "&": { height: "100%" } }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // Restore cursor position and scroll
    if (initialCursorLine && initialCursorLine > 0) {
      try {
        const line = view.state.doc.line(Math.min(initialCursorLine, view.state.doc.lines));
        const pos = line.from + Math.min((initialCursorCol || 1) - 1, line.length);
        view.dispatch({ selection: { anchor: pos } });
        if (initialScrollTop) {
          requestAnimationFrame(() => { view.scrollDOM.scrollTop = initialScrollTop; });
        }
      } catch {}
    }

    return () => {
      if (changeTimer) clearTimeout(changeTimer);
      lspClientRef.current?.didClose(`file://${filePath}`);
      diagCleanupRef.current?.();
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only recreate editor when file identity changes, not on every callback/content update
  }, [filename, filePath]);

  // Only sync content from parent when the file is reloaded (content prop changes from parent)
  // Do NOT include onChange in deps — it changes every render and would reset the editor
  const contentRef = useRef(content);
  useEffect(() => {
    // Skip if content hasn't actually changed from last load
    if (content === contentRef.current) return;
    contentRef.current = content;
    if (!viewRef.current) return;
    const current = viewRef.current.state.doc.toString();
    if (current !== content) {
      viewRef.current.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
      savedContentRef.current = content;
    }
  }, [content]);

  return (
    <div className="editor-pane" style={{ position: "relative" }}>
      <div ref={containerRef} style={{ flex: 1, overflow: "hidden" }} />
      {blameInfo && (
        <div className="editor-blame">
          {blameInfo.author}, {blameInfo.date} — {blameInfo.summary}
        </div>
      )}
    </div>
  );
}
