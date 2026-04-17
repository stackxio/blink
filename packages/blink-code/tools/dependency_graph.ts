import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Visualize import dependencies between files in a project as a text graph. */

export async function dependency_graph(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const entryFile = input["entry"] as string | undefined;
  const depth = typeof input["depth"] === "number" ? Math.min(input["depth"], 5) : 3;
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    // Get all TS/JS files
    exec(
      `git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null | grep -v node_modules | grep -v '.d.ts' | head -100`,
      { cwd: absRoot, maxBuffer: 2 * 1024 * 1024 },
      async (_, stdout) => {
        const files = stdout.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          resolve_fn("No TypeScript/JavaScript files found.");
          return;
        }

        // Build import map: file -> what it imports (relative imports only)
        const importMap = new Map<string, string[]>();
        const importPattern = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;

        for (const file of files) {
          const absFile = resolve(absRoot, file);
          try {
            const content = await readFile(absFile, "utf8");
            const imports: string[] = [];
            let m: RegExpExecArray | null;
            const pattern = new RegExp(importPattern.source, "g");
            while ((m = pattern.exec(content)) !== null) {
              imports.push(m[1]);
            }
            importMap.set(file, imports);
          } catch { /* skip */ }
        }

        // Find entry point or most-imported file
        let entry = entryFile;
        if (!entry) {
          // Count how many times each file is imported
          const importCounts = new Map<string, number>();
          for (const [file, imports] of importMap) {
            // For each import, try to resolve to a file
            for (const imp of imports) {
              for (const f of files) {
                if (f.includes(imp.replace(/^\.\//, "").replace(/^\.\.\//, ""))) {
                  importCounts.set(f, (importCounts.get(f) ?? 0) + 1);
                }
              }
            }
          }
          // Find file with most imports or biggest (heuristic: index or main)
          entry = files.find((f) => /\/(index|main|app)\.(ts|tsx|js|jsx)$/.test(f)) ||
            [...importCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
            files[0];
        }

        if (!entry) {
          resolve_fn("Could not determine entry point.");
          return;
        }

        // BFS to build tree
        const seen = new Set<string>();
        const lines: string[] = [`Dependency graph from: ${entry}`, ""];

        function buildTree(file: string, indent: number, currentDepth: number) {
          if (currentDepth > depth || seen.has(file)) {
            if (seen.has(file)) {
              lines.push(`${"  ".repeat(indent)}${file} (circular)`);
            }
            return;
          }
          seen.add(file);
          const prefix = indent === 0 ? "" : "  ".repeat(indent - 1) + "└─ ";
          lines.push(`${prefix}${file}`);

          const imports = importMap.get(file) ?? [];
          for (const imp of imports.slice(0, 10)) {
            // Try to resolve the import to an actual file
            const normalized = imp.replace(/\.\//g, "").replace(/\.\.\//g, "");
            const resolved = files.find((f) =>
              f.includes(normalized) || f.replace(/\.(ts|tsx|js|jsx)$/, "") === normalized
            );
            if (resolved) buildTree(resolved, indent + 1, currentDepth + 1);
          }
        }

        buildTree(entry, 0, 0);

        const stats = `\nTotal files: ${files.length}, showing up to depth ${depth}`;
        resolve_fn(lines.join("\n") + stats);
      }
    );
  });
}

export const def = {
  name: "dependency_graph",
  description:
    "Visualize import dependencies between TypeScript/JavaScript files as a text tree, starting from an entry file. Shows relative imports only, up to a configurable depth.",
  parameters: {
    type: "object",
    properties: {
      entry: {
        type: "string",
        description: "Entry file to start the graph from (default: auto-detect index/main/app)",
      },
      depth: {
        type: "number",
        description: "Maximum depth of the dependency tree (default: 3, max: 5)",
      },
      root: {
        type: "string",
        description: "Root directory of the project (default: current workspace)",
      },
    },
    required: [],
  },
};
