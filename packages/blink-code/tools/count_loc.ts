import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

/** Count lines of code by extension, distinguishing code/comments/blank. */

const COMMENT_STYLES: Record<string, { line?: string; block?: [string, string] }> = {
  ".ts": { line: "//", block: ["/*", "*/"] },
  ".tsx": { line: "//", block: ["/*", "*/"] },
  ".js": { line: "//", block: ["/*", "*/"] },
  ".jsx": { line: "//", block: ["/*", "*/"] },
  ".rs": { line: "//", block: ["/*", "*/"] },
  ".go": { line: "//", block: ["/*", "*/"] },
  ".c": { line: "//", block: ["/*", "*/"] },
  ".cpp": { line: "//", block: ["/*", "*/"] },
  ".java": { line: "//", block: ["/*", "*/"] },
  ".py": { line: "#" },
  ".rb": { line: "#" },
  ".sh": { line: "#" },
  ".yaml": { line: "#" },
  ".yml": { line: "#" },
  ".toml": { line: "#" },
  ".html": { block: ["<!--", "-->"] },
  ".css": { block: ["/*", "*/"] },
  ".scss": { line: "//", block: ["/*", "*/"] },
};

export async function count_loc(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    exec(
      `git ls-files 2>/dev/null | head -2000`,
      { cwd: absRoot, maxBuffer: 8 * 1024 * 1024 },
      async (_, stdout) => {
        const files = stdout.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          resolve_fn("No files found.");
          return;
        }

        const stats: Record<string, { files: number; code: number; comments: number; blank: number }> = {};

        for (const file of files) {
          const ext = extname(file);
          if (!ext) continue;
          const style = COMMENT_STYLES[ext];
          if (!style) continue;

          try {
            const content = await readFile(resolve(absRoot, file), "utf8");
            const lines = content.split("\n");
            let code = 0, comments = 0, blank = 0;
            let inBlock = false;
            for (const lineRaw of lines) {
              const line = lineRaw.trim();
              if (inBlock) {
                comments++;
                if (style.block && line.includes(style.block[1])) inBlock = false;
                continue;
              }
              if (line === "") { blank++; continue; }
              if (style.block && line.startsWith(style.block[0])) {
                comments++;
                if (!line.includes(style.block[1])) inBlock = true;
                continue;
              }
              if (style.line && line.startsWith(style.line)) {
                comments++;
                continue;
              }
              code++;
            }
            const s = stats[ext] ??= { files: 0, code: 0, comments: 0, blank: 0 };
            s.files++;
            s.code += code;
            s.comments += comments;
            s.blank += blank;
          } catch { /* skip */ }
        }

        const sorted = Object.entries(stats).sort((a, b) => b[1].code - a[1].code);
        const lines: string[] = [
          "Lines of code by extension:",
          "",
          "  ext     files      code   comments     blank      total",
          "  ----   ------   -------   --------   -------   --------",
        ];
        let totals = { files: 0, code: 0, comments: 0, blank: 0 };
        for (const [ext, s] of sorted) {
          const total = s.code + s.comments + s.blank;
          lines.push(
            `  ${ext.padEnd(5)}  ${String(s.files).padStart(6)}  ${String(s.code).padStart(8)}  ${String(s.comments).padStart(9)}  ${String(s.blank).padStart(8)}  ${String(total).padStart(9)}`,
          );
          totals.files += s.files;
          totals.code += s.code;
          totals.comments += s.comments;
          totals.blank += s.blank;
        }
        lines.push(
          "  ----   ------   -------   --------   -------   --------",
          `  total  ${String(totals.files).padStart(6)}  ${String(totals.code).padStart(8)}  ${String(totals.comments).padStart(9)}  ${String(totals.blank).padStart(8)}  ${String(totals.code + totals.comments + totals.blank).padStart(9)}`,
        );
        resolve_fn(lines.join("\n"));
      },
    );
  });
}

export const def = {
  name: "count_loc",
  description:
    "Count lines of code by file extension, distinguishing code, comments, and blank lines. Supports TS/JS/Rust/Go/Python/Ruby/Shell/YAML/TOML/HTML/CSS/SCSS.",
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
