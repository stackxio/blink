import { useEffect, useRef, useCallback } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintGutter } from "@codemirror/lint";
import { darkSyntaxHighlighting } from "./cm-theme";
import { LspClient } from "./lsp-client";
import { lspDiagnosticsListener } from "./cm-lsp-extension";
import { useAppStore } from "@/stores/app";

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
    case "html": case "htm": case "svelte": case "vue": return html();
    case "css": case "scss": case "less": return css();
    case "json": case "jsonc": return json();
    case "md": case "mdx": return markdown();
    case "xml": case "svg": case "plist": return xml();
    case "yaml": case "yml": return yaml();
    case "sql": return sql();
    default: return [];
  }
}

interface Props {
  content: string;
  filename: string;
  filePath: string;
  onSave: (content: string) => void;
  onChange: (modified: boolean) => void;
}

export default function Editor({ content, filename, filePath, onSave, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const savedContentRef = useRef(content);
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
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        darkSyntaxHighlighting,
        autocompletion(), // CM's built-in — no LSP override
        lintGutter(),
        ...(Array.isArray(lang) ? lang : [lang]),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
          { key: "Mod-s", run: () => { handleSave(); return true; } },
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
        EditorView.theme({ "&": { height: "100%" } }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      if (changeTimer) clearTimeout(changeTimer);
      lspClientRef.current?.didClose(`file://${filePath}`);
      diagCleanupRef.current?.();
      view.destroy();
      viewRef.current = null;
    };
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

  return <div ref={containerRef} className="editor-pane" />;
}
