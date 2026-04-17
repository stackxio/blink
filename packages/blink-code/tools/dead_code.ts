import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

/** Find potentially unused exports, functions, and variables in a TypeScript/JavaScript project. */

export async function dead_code(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    // Get all exported symbols
    exec(
      `git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null | head -200`,
      { cwd: absRoot, maxBuffer: 2 * 1024 * 1024 },
      async (_, stdout) => {
        const files = stdout.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          resolve_fn("No TypeScript/JavaScript files found.");
          return;
        }

        // Extract all exported symbols
        const exportPattern = /^export\s+(?:(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)|(\{[^}]+\}))/gm;
        const exportedSymbols: Map<string, string> = new Map(); // symbol -> file

        for (const file of files.slice(0, 100)) {
          const absFile = resolve(absRoot, file);
          try {
            const content = await readFile(absFile, "utf8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              // Named exports: export function foo, export const foo, etc.
              const m = line.match(/^export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/);
              if (m && m[1] && !["default", "type"].includes(m[1])) {
                exportedSymbols.set(m[1], `${file}:${i + 1}`);
              }
            }
          } catch { /* skip */ }
        }

        if (exportedSymbols.size === 0) {
          resolve_fn("No exported symbols found to check.");
          return;
        }

        // For each exported symbol, check if it's imported anywhere
        const allContent = await (async () => {
          const parts: string[] = [];
          for (const file of files.slice(0, 100)) {
            try {
              parts.push(await readFile(resolve(absRoot, file), "utf8"));
            } catch { /* skip */ }
          }
          return parts.join("\n");
        })();

        const unused: string[] = [];
        for (const [symbol, location] of exportedSymbols) {
          // Check if the symbol is imported/used elsewhere (rough check)
          const importPattern = new RegExp(`\\b${symbol}\\b`);
          const occurrences = (allContent.match(new RegExp(`\\b${symbol}\\b`, "g")) ?? []).length;
          // At minimum 1 occurrence for the definition itself — if only 1-2, likely unused
          if (occurrences <= 2) {
            unused.push(`  ${symbol.padEnd(40)} (${location})`);
          }
        }

        if (unused.length === 0) {
          resolve_fn(`✅ All ${exportedSymbols.size} exported symbols appear to be used (scanned ${files.length} files).`);
          return;
        }

        resolve_fn(
          `Potentially unused exports (${unused.length}/${exportedSymbols.size} scanned, ${files.length} files):\n${unused.join("\n")}\n\n⚠️  This is a heuristic check — verify before removing.`,
        );
      },
    );
  });
}

export const def = {
  name: "dead_code",
  description:
    "Find potentially unused exported symbols (functions, classes, constants, types) in a TypeScript/JavaScript project using heuristic occurrence counting. Useful for identifying code to clean up.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the project (default: current workspace)",
      },
    },
    required: [],
  },
};
