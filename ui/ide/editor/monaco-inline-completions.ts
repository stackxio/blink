import { loadBlinkCodeConfig } from "@@/panel/config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InlineCompletionItem {
  insertText: string | { snippet: string };
  range?: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPrompt(prefix: string, suffix: string, language: string): string {
  const MAX_PREFIX = 1200;
  const MAX_SUFFIX = 400;
  const truncatedPrefix =
    prefix.length > MAX_PREFIX ? "..." + prefix.slice(prefix.length - MAX_PREFIX) : prefix;
  const truncatedSuffix = suffix.length > MAX_SUFFIX ? suffix.slice(0, MAX_SUFFIX) + "..." : suffix;

  return [
    `Complete the following ${language} code. Output ONLY the completion text that should be inserted at the cursor position — no explanation, no markdown, no surrounding code.`,
    `The completion should be at most 1-3 lines. If there is nothing meaningful to complete, output an empty string.`,
    ``,
    `<PREFIX>`,
    truncatedPrefix,
    `</PREFIX>`,
    `<SUFFIX>`,
    truncatedSuffix,
    `</SUFFIX>`,
    ``,
    `Output only the text to insert between PREFIX and SUFFIX:`,
  ].join("\n");
}

async function fetchCompletion(
  prefix: string,
  suffix: string,
  language: string,
  signal: AbortSignal,
): Promise<string | null> {
  const config = loadBlinkCodeConfig();
  if (config.provider.type !== "openai-compat") return null;

  const { baseUrl = "http://localhost:11434/v1", apiKey = "ollama", model } = config.provider;
  if (!model) return null;

  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildPrompt(prefix, suffix, language) }],
        max_tokens: 128,
        temperature: 0.1,
        stream: false,
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let json: any;
  try {
    json = await response.json();
  } catch {
    return null;
  }

  const raw: string = json?.choices?.[0]?.message?.content ?? "";
  // Strip any accidental code fences
  const stripped = raw
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trimEnd();

  return stripped || null;
}

// ── Provider factory ──────────────────────────────────────────────────────────

export function createInlineCompletionsProvider(monacoApi: any, languageId: string) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentController: AbortController | null = null;

  return monacoApi.languages.registerInlineCompletionsProvider(languageId, {
    async provideInlineCompletions(
      model: any,
      position: any,
      _context: any,
      token: any,
    ): Promise<{ items: InlineCompletionItem[] } | null> {
      // Debounce: cancel any pending request
      if (debounceTimer) clearTimeout(debounceTimer);
      currentController?.abort();

      return new Promise((resolve) => {
        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) {
            resolve(null);
            return;
          }

          const controller = new AbortController();
          currentController = controller;

          // Build prefix/suffix
          const prefix = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const lineCount = model.getLineCount();
          const lastCol = model.getLineMaxColumn(lineCount);
          const suffix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: lineCount,
            endColumn: lastCol,
          });

          // Skip completions on blank lines or when cursor is at very start
          const currentLine = model.getLineContent(position.lineNumber);
          const lineBeforeCursor = currentLine.slice(0, position.column - 1).trim();
          if (!lineBeforeCursor) {
            resolve(null);
            return;
          }

          const completion = await fetchCompletion(prefix, suffix, languageId, controller.signal);

          if (token.isCancellationRequested || !completion) {
            resolve(null);
            return;
          }

          resolve({
            items: [{ insertText: completion }],
          });
        }, 600); // 600ms debounce
      });
    },

    freeInlineCompletions() {
      // nothing to free
    },
  });
}

// ── Multi-language registration ───────────────────────────────────────────────

const INLINE_COMPLETION_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "cpp",
  "csharp",
  "html",
  "css",
  "scss",
  "json",
  "yaml",
  "markdown",
  "shell",
  "sql",
  "ruby",
  "kotlin",
  "swift",
  "php",
  "plaintext",
];

export function registerInlineCompletions(monacoApi: any): (() => void)[] {
  return INLINE_COMPLETION_LANGUAGES.map((lang) => {
    const disposable = createInlineCompletionsProvider(monacoApi, lang);
    return () => disposable.dispose();
  });
}
