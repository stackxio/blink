import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Extract all string literals from a source file — useful for i18n, hardcoded values, magic strings. */

export async function extract_strings(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const root = (input["root"] as string) || process.cwd();
  const minLength = typeof input["min_length"] === "number" ? input["min_length"] : 3;
  const skipComments = input["skip_comments"] !== false;
  const unique = input["unique"] !== false;

  if (!filePath) return "Error: path is required.";

  const absPath = filePath.startsWith("/") ? filePath : resolve(root, filePath);
  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (e) {
    return `Error reading file: ${String(e)}`;
  }

  // Remove comments if requested
  let cleaned = content;
  if (skipComments) {
    cleaned = cleaned
      .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
      .replace(/\/\/[^\n]*/g, " ") // line comments
      .replace(/#[^\n]*/g, " "); // python/shell comments
  }

  const strings: Array<{ value: string; line: number; quote: string }> = [];
  const lines = content.split("\n");

  // Track line numbers from original content
  let charPos = 0;
  const lineForPos = (pos: number): number => {
    let line = 1;
    for (let i = 0; i < pos && i < content.length; i++) {
      if (content[i] === "\n") line++;
    }
    return line;
  };

  // Extract single and double quoted strings (non-template)
  const strPattern = /(['"])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let m: RegExpExecArray | null;

  while ((m = strPattern.exec(cleaned)) !== null) {
    const value = m[2];
    if (value.length < minLength) continue;
    // Skip import paths, class names, etc.
    if (/^[./]/.test(value) && value.includes("/")) continue; // paths
    if (/^[A-Z][A-Z_0-9]*$/.test(value)) continue; // ALL_CAPS constants
    strings.push({ value, quote: m[1], line: lineForPos(m.index) });
  }

  // Extract template literals (backticks) — just the static parts
  const tplPattern = /`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  while ((m = tplPattern.exec(cleaned)) !== null) {
    const value = m[1].replace(/\$\{[^}]*\}/g, "…").trim();
    if (value.length >= minLength && !value.startsWith("./") && !value.startsWith("..")) {
      strings.push({ value, quote: "`", line: lineForPos(m.index) });
    }
  }

  if (strings.length === 0) {
    return `No string literals found (min length: ${minLength}) in ${filePath}.`;
  }

  // Optionally deduplicate
  let output = strings;
  if (unique) {
    const seen = new Set<string>();
    output = strings.filter(({ value }) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  const header = `Found ${output.length} string literal(s) in ${filePath} (${unique ? "unique" : "all"}):`;
  const rows = output.slice(0, 200).map((s) => `  Line ${String(s.line).padStart(4)}: ${s.quote}${s.value.slice(0, 80)}${s.value.length > 80 ? "…" : ""}${s.quote}`);
  const suffix = output.length > 200 ? `\n... and ${output.length - 200} more` : "";

  return `${header}\n\n${rows.join("\n")}${suffix}`;
}

export const def = {
  name: "extract_strings",
  description:
    "Extract all string literals from a source file. Useful for finding hardcoded strings for i18n, magic strings to refactor into constants, or reviewing UI copy. Skips import paths and ALL_CAPS constants.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the source file",
      },
      min_length: {
        type: "number",
        description: "Minimum string length to include (default: 3)",
      },
      skip_comments: {
        type: "boolean",
        description: "Skip strings in comments (default: true)",
      },
      unique: {
        type: "boolean",
        description: "Only show unique values (default: true)",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
