import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

interface LangStats {
  files: number;
  lines: number;
}

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".rs": "Rust",
  ".py": "Python",
  ".go": "Go",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C", ".h": "C",
  ".cpp": "C++", ".cc": "C++", ".cxx": "C++", ".hpp": "C++",
  ".cs": "C#",
  ".rb": "Ruby",
  ".php": "PHP",
  ".html": "HTML", ".htm": "HTML",
  ".css": "CSS", ".scss": "SCSS", ".sass": "SASS", ".less": "LESS",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".md": "Markdown", ".mdx": "Markdown",
  ".json": "JSON",
  ".yaml": "YAML", ".yml": "YAML",
  ".toml": "TOML",
  ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
  ".sql": "SQL",
};

async function countLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

export async function project_stats(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();

  return new Promise((resolve) => {
    exec(
      `git ls-files`,
      { cwd: root, maxBuffer: 20 * 1024 * 1024 },
      async (err, stdout) => {
        let files: string[];
        if (!err && stdout.trim()) {
          files = stdout.trim().split("\n").filter(Boolean);
        } else {
          // Fallback: find files, excluding common dirs
          const result = await new Promise<string>((res) => {
            exec(
              `find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/target/*'`,
              { cwd: root, maxBuffer: 20 * 1024 * 1024 },
              (_e, out) => res(out),
            );
          });
          files = result.trim().split("\n").filter(Boolean).map((f) => f.replace(/^\.\//, ""));
        }

        const langStats: Record<string, LangStats> = {};
        let totalFiles = 0;
        let totalLines = 0;

        // Process files in batches
        for (const file of files.slice(0, 5000)) {
          const ext = path.extname(file).toLowerCase();
          const lang = EXT_TO_LANG[ext];
          if (!lang) continue;

          const absPath = path.isAbsolute(file) ? file : path.join(root, file);
          const lines = await countLines(absPath);
          if (!langStats[lang]) langStats[lang] = { files: 0, lines: 0 };
          langStats[lang].files++;
          langStats[lang].lines += lines;
          totalFiles++;
          totalLines += lines;
        }

        // Sort by lines desc
        const sorted = Object.entries(langStats).sort(([, a], [, b]) => b.lines - a.lines);

        const lines = [
          `Project: ${path.basename(root)}`,
          `Total source files: ${totalFiles}`,
          `Total lines of code: ${totalLines.toLocaleString()}`,
          "",
          "Languages:",
          ...sorted.map(([lang, s]) => {
            const pct = ((s.lines / totalLines) * 100).toFixed(1);
            return `  ${lang}: ${s.files} files, ${s.lines.toLocaleString()} lines (${pct}%)`;
          }),
        ];

        resolve(lines.join("\n"));
      },
    );
  });
}

export const def = {
  name: "project_stats",
  description:
    "Analyze the project codebase and return statistics: total files, lines of code, and a breakdown by programming language. Uses git ls-files to respect .gitignore.",
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
