let monacoPromise: Promise<any> | null = null;

const modelRefs = new Map<string, number>();

function cssVar(name: string, fallback: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;

  const probe = document.createElement("div");
  probe.style.color = raw;
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const normalized = normalizeColor(resolved || raw);
  return normalized || fallback;
}

function normalizeColor(value: string) {
  const color = value.trim().toLowerCase();
  if (!color) return null;
  if (color.startsWith("#")) return color;

  const match = color.match(
    /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,\/]+([0-9.]+))?\s*\)$/,
  );
  if (!match) return null;

  const [, r, g, b, a] = match;
  const toHex = (component: string) => Number(component).toString(16).padStart(2, "0");
  const rgb = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (a == null) return rgb;

  const alpha = Math.round(Math.max(0, Math.min(1, Number(a))) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${rgb}${alpha}`;
}

function defineCodriftTheme(monacoApi: any) {
  const isDark = document.documentElement.classList.contains("dark");
  monacoApi.editor.defineTheme("codrift", {
    base: isDark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": cssVar("--c-bg", isDark ? "#151515" : "#ffffff"),
      "editor.foreground": cssVar("--c-fg", isDark ? "#f5f5f5" : "#222222"),
      "editorLineNumber.foreground": cssVar("--c-muted-fg", isDark ? "#7a7a7a" : "#9a9a9a"),
      "editorLineNumber.activeForeground": cssVar("--c-fg", isDark ? "#f5f5f5" : "#222222"),
      "editorCursor.foreground": cssVar("--c-accent", "#64C5B9"),
      "editor.selectionBackground": isDark ? "#64c5b940" : "#0e948833",
      "editor.lineHighlightBackground": isDark ? "#2a2a2a80" : "#e9e9e980",
      "editorGutter.background": cssVar("--c-bg", isDark ? "#151515" : "#ffffff"),
      "editorWhitespace.foreground": "transparent",
      "editorIndentGuide.background1": isDark ? "#ffffff12" : "#00000014",
      "editorIndentGuide.activeBackground1": isDark ? "#ffffff1a" : "#0000001c",
      "editorHoverWidget.background": cssVar("--c-popover", isDark ? "#1d1d1d" : "#ffffff"),
      "editorHoverWidget.border": cssVar("--c-border", "#2a2a2a"),
      "editorWidget.background": cssVar("--c-popover", isDark ? "#1d1d1d" : "#ffffff"),
      "editorWidget.border": cssVar("--c-border", "#2a2a2a"),
      "editorSuggestWidget.background": cssVar("--c-popover", isDark ? "#1d1d1d" : "#ffffff"),
      "editorSuggestWidget.border": cssVar("--c-border", "#2a2a2a"),
      "editorSuggestWidget.selectedBackground": cssVar("--c-surface-raised", "#262626"),
      "editorOverviewRuler.border": "transparent",
      "scrollbarSlider.background": isDark ? "#8b8b8b44" : "#88888833",
      "scrollbarSlider.hoverBackground": isDark ? "#8b8b8b66" : "#88888855",
      "scrollbarSlider.activeBackground": isDark ? "#8b8b8b88" : "#88888877",
    },
  });
  monacoApi.editor.setTheme("codrift");
}

/**
 * Fire-and-forget Monaco preload — call as soon as the app mounts so that
 * the heavy dynamic imports start warming up in the background before the
 * user opens their first file.
 */
export function preloadMonaco(): void {
  // Kick off setupMonaco without awaiting it.  The internal `monacoPromise`
  // singleton ensures we never spin up duplicate work.
  setupMonaco().catch(() => {});
}

export async function setupMonaco() {
  if (!monacoPromise) {
    monacoPromise = (async () => {
      const monacoApi = await import("monaco-editor/esm/vs/editor/editor.api.js");
      const editorWorker = (await import("monaco-editor/esm/vs/editor/editor.worker.js?worker"))
        .default;
      const jsonWorker = (await import("monaco-editor/esm/vs/language/json/json.worker.js?worker"))
        .default;
      const cssWorker = (await import("monaco-editor/esm/vs/language/css/css.worker.js?worker"))
        .default;
      const htmlWorker = (await import("monaco-editor/esm/vs/language/html/html.worker.js?worker"))
        .default;

      await Promise.all([
        import("monaco-editor/esm/vs/language/css/monaco.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/go/go.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/html/html.contribution.js"),
        import("monaco-editor/esm/vs/language/html/monaco.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/java/java.contribution.js"),
        import("monaco-editor/esm/vs/language/json/monaco.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/less/less.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/liquid/liquid.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/php/php.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/python/python.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/scss/scss.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js"),
        import("monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js"),
      ]);

      (
        self as typeof self & {
          MonacoEnvironment?: {
            getWorker: (_moduleId: string, label: string) => Worker;
          };
        }
      ).MonacoEnvironment = {
        getWorker(_moduleId, label) {
          if (label === "json") return new jsonWorker();
          if (label === "css" || label === "scss" || label === "less") return new cssWorker();
          if (label === "html" || label === "handlebars" || label === "razor") {
            return new htmlWorker();
          }
          return new editorWorker();
        },
      };

      defineCodriftTheme(monacoApi);
      return monacoApi;
    })();
  }

  const monacoApi = await monacoPromise;
  defineCodriftTheme(monacoApi);
  return monacoApi;
}

export function observeMonacoTheme(monacoApi: any, onThemeChange: () => void) {
  const observer = new MutationObserver(() => {
    defineCodriftTheme(monacoApi);
    onThemeChange();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => observer.disconnect();
}

const LANGUAGE_BY_EXTENSION: Record<string, { editor: string; lsp?: string }> = {
  js: { editor: "javascript", lsp: "javascript" },
  jsx: { editor: "javascript", lsp: "javascriptreact" },
  mjs: { editor: "javascript", lsp: "javascript" },
  cjs: { editor: "javascript", lsp: "javascript" },
  ts: { editor: "typescript", lsp: "typescript" },
  tsx: { editor: "typescript", lsp: "typescriptreact" },
  py: { editor: "python" },
  rs: { editor: "rust" },
  go: { editor: "go" },
  java: { editor: "java" },
  c: { editor: "cpp" },
  cpp: { editor: "cpp" },
  cc: { editor: "cpp" },
  cxx: { editor: "cpp" },
  h: { editor: "cpp" },
  hpp: { editor: "cpp" },
  php: { editor: "php" },
  html: { editor: "html" },
  htm: { editor: "html" },
  svelte: { editor: "html" },
  vue: { editor: "html" },
  css: { editor: "css" },
  scss: { editor: "scss" },
  sass: { editor: "scss" },
  less: { editor: "less" },
  json: { editor: "json" },
  jsonc: { editor: "json" },
  md: { editor: "markdown" },
  mdx: { editor: "markdown" },
  xml: { editor: "xml" },
  svg: { editor: "xml" },
  plist: { editor: "xml" },
  yaml: { editor: "yaml" },
  yml: { editor: "yaml" },
  sql: { editor: "sql" },
};

function languageConfigForFile(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ext && LANGUAGE_BY_EXTENSION[ext]) || { editor: "plaintext" };
}

export function getLanguageId(filename: string) {
  return languageConfigForFile(filename).editor;
}

export function getLspLanguageId(filename: string) {
  const config = languageConfigForFile(filename);
  return config.lsp ?? config.editor;
}

export function retainModel(monacoApi: any, uri: string, value: string, language: string) {
  const modelUri = monacoApi.Uri.parse(uri);
  let model = monacoApi.editor.getModel(modelUri);
  if (!model) {
    model = monacoApi.editor.createModel(
      value,
      language !== "plaintext" ? language : undefined,
      modelUri,
    );
  } else {
    if (language !== "plaintext" && model.getLanguageId() !== language) {
      monacoApi.editor.setModelLanguage(model, language);
    }
    if (model.getValue() !== value) {
      model.setValue(value);
    }
  }
  if (language === "typescript" || language === "javascript") {
    monacoApi.editor.setModelMarkers(model, "typescript", []);
    monacoApi.editor.setModelMarkers(model, "javascript", []);
  }
  modelRefs.set(uri, (modelRefs.get(uri) ?? 0) + 1);
  return model;
}

export function releaseModel(monacoApi: any, uri: string) {
  const modelUri = monacoApi.Uri.parse(uri);
  const model = monacoApi.editor.getModel(modelUri);
  const nextRefs = (modelRefs.get(uri) ?? 0) - 1;
  if (nextRefs <= 0) {
    modelRefs.delete(uri);
    if (model) {
      monacoApi.editor.setModelMarkers(model, "codrift-lsp", []);
      model.dispose();
    }
    return;
  }
  modelRefs.set(uri, nextRefs);
}
