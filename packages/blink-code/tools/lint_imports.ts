import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Detect unused imports in a TypeScript or JavaScript file. */

export async function lint_imports(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const root = (input["root"] as string) || process.cwd();

  if (!filePath) return "Error: path is required.";

  const absPath = filePath.startsWith("/") ? filePath : resolve(root, filePath);
  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (e) {
    return `Error reading file: ${String(e)}`;
  }

  const lines = content.split("\n");
  const importLines: Array<{ lineNum: number; symbols: string[]; source: string; raw: string }> = [];

  // Parse import statements
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // Single-line import: import { a, b } from "..."
    const singleMatch = line.match(/^import\s+(?:type\s+)?(.+?)\s+from\s+["'](.+?)["']/);
    if (singleMatch) {
      const symbols = extractSymbols(singleMatch[1]);
      importLines.push({ lineNum: i + 1, symbols, source: singleMatch[2], raw: line });
      i++;
      continue;
    }

    // Multi-line import
    if (line.startsWith("import") && line.includes("{") && !line.includes("}")) {
      let combined = line;
      let j = i + 1;
      while (j < lines.length && !lines[j].includes("}")) {
        combined += " " + lines[j].trim();
        j++;
      }
      if (j < lines.length) {
        combined += " " + lines[j].trim();
      }
      const mlMatch = combined.match(/^import\s+(?:type\s+)?(.+?)\s+from\s+["'](.+?)["']/);
      if (mlMatch) {
        const symbols = extractSymbols(mlMatch[1]);
        importLines.push({ lineNum: i + 1, symbols, source: mlMatch[2], raw: combined });
      }
      i = j + 1;
      continue;
    }

    i++;
  }

  if (importLines.length === 0) return `No imports found in ${filePath}.`;

  // Get the content without import lines for usage checking
  const bodyContent = lines
    .filter((_, idx) => idx >= (importLines[importLines.length - 1]?.lineNum ?? 0))
    .join("\n");

  const unused: Array<{ symbol: string; source: string; line: number }> = [];
  const usedSymbols = new Set<string>();

  for (const imp of importLines) {
    for (const sym of imp.symbols) {
      if (!sym || sym === "*" || sym === "default") continue;
      // Check if symbol is used in the body (not counting the import line itself)
      const pattern = new RegExp(`\\b${sym}\\b`);
      if (!pattern.test(bodyContent)) {
        unused.push({ symbol: sym, source: imp.source, line: imp.lineNum });
      } else {
        usedSymbols.add(sym);
      }
    }
  }

  if (unused.length === 0) {
    return `✅ All ${importLines.length} import(s) appear to be used in ${filePath}.`;
  }

  const lines2 = [
    `${unused.length} potentially unused import(s) in ${filePath}:`,
    "",
    ...unused.map((u) => `  Line ${u.line}: '${u.symbol}' from '${u.source}'`),
    "",
    `⚠️  Heuristic check — verify before removing (type imports used as types may show false positives).`,
  ];

  return lines2.join("\n");
}

function extractSymbols(importClause: string): string[] {
  const symbols: string[] = [];
  const braceMatch = importClause.match(/\{([^}]+)\}/);
  if (braceMatch) {
    for (const sym of braceMatch[1].split(",")) {
      const clean = sym.trim().split(/\s+as\s+/).pop()?.trim() ?? "";
      if (clean) symbols.push(clean);
    }
  }
  // Default import: import Foo from "..."
  const defaultMatch = importClause.match(/^(\w+)(?:\s*,|\s*$)/);
  if (defaultMatch && !importClause.includes("{")) {
    symbols.push(defaultMatch[1]);
  }
  return symbols;
}

export const def = {
  name: "lint_imports",
  description:
    "Detect potentially unused imports in a TypeScript or JavaScript file by checking if each imported symbol is referenced in the file body.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the TypeScript/JavaScript file to check",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
