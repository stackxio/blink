import { useEffect, useRef } from "react";
import { setupMonaco } from "../editor/monaco-setup";

interface Props {
  original: string;
  modified: string;
  filename: string;
  className?: string;
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    xml: "xml",
    rb: "ruby",
    kt: "kotlin",
    swift: "swift",
    php: "php",
  };
  return map[ext] ?? "plaintext";
}

export default function MonacoDiffViewer({ original, modified, filename, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let diffEditor: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalModel: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let modifiedModel: any = null;

    void (async () => {
      if (!containerRef.current) return;
      const monacoApi = await setupMonaco();
      if (disposed || !containerRef.current) return;

      const language = getLanguageFromFilename(filename);

      diffEditor = monacoApi.editor.createDiffEditor(containerRef.current, {
        readOnly: true,
        renderSideBySide: false,
        enableSplitViewResizing: false,
        ignoreTrimWhitespace: false,
        renderIndicators: true,
        scrollBeyondLastLine: false,
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: "on",
        folding: false,
        wordWrap: "off",
        theme: "vs-dark",
        padding: { top: 8, bottom: 8 },
      });

      originalModel = monacoApi.editor.createModel(original, language);
      modifiedModel = monacoApi.editor.createModel(modified, language);

      diffEditor.setModel({ original: originalModel, modified: modifiedModel });
      editorRef.current = diffEditor;
    })();

    return () => {
      disposed = true;
      originalModel?.dispose();
      modifiedModel?.dispose();
      diffEditor?.dispose();
      editorRef.current = null;
    };
  }, [original, modified, filename]);

  return <div ref={containerRef} className={className ?? "git-panel__diff-monaco"} />;
}
