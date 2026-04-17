import { exec } from "node:child_process";
import { readdir, stat, readFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";

/** Produce a summary of a directory: file counts, sizes, and top files by size. */

const EXT_CATEGORIES: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".rs": "Rust", ".py": "Python", ".go": "Go", ".java": "Java", ".kt": "Kotlin",
  ".css": "CSS", ".scss": "CSS", ".html": "HTML", ".json": "JSON", ".md": "Markdown",
  ".toml": "TOML", ".yaml": "YAML", ".yml": "YAML", ".sh": "Shell", ".env": "Config",
  ".png": "Image", ".jpg": "Image", ".jpeg": "Image", ".gif": "Image", ".webp": "Image",
  ".svg": "SVG", ".lock": "Lock", ".txt": "Text",
};

export async function summarize_directory(input: Record<string, unknown>): Promise<string> {
  const dir = (input["dir"] as string) || process.cwd();
  const root = (input["root"] as string) || process.cwd();
  const absDir = dir.startsWith("/") ? dir : resolve(root, dir);
  const maxDepth = typeof input["depth"] === "number" ? input["depth"] : 2;

  interface FileInfo { path: string; size: number; ext: string; }
  const allFiles: FileInfo[] = [];

  async function scan(d: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch { return; }

    for (const e of entries) {
      const fullPath = join(d, e.name);
      // Skip common non-essential dirs
      if (e.isDirectory()) {
        if (["node_modules", ".git", "target", ".next", "dist", "build", "out", ".cache"].includes(e.name)) continue;
        await scan(fullPath, depth + 1);
      } else if (e.isFile()) {
        try {
          const s = await stat(fullPath);
          allFiles.push({ path: fullPath.replace(absDir + "/", ""), size: s.size, ext: extname(e.name).toLowerCase() });
        } catch { /* skip */ }
      }
    }
  }

  await scan(absDir, 0);

  if (allFiles.length === 0) return `No files found in ${dir}`;

  // Category breakdown
  const categories: Record<string, { count: number; bytes: number }> = {};
  let totalBytes = 0;
  for (const f of allFiles) {
    const rawExt = f.ext.replace(".", "").toUpperCase();
    const cat = EXT_CATEGORIES[f.ext] ?? (rawExt || "Other");
    if (!categories[cat]) categories[cat] = { count: 0, bytes: 0 };
    categories[cat].count++;
    categories[cat].bytes += f.size;
    totalBytes += f.size;
  }

  const sortedCats = Object.entries(categories)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([cat, { count, bytes }]) => `  ${cat.padEnd(16)} ${String(count).padStart(5)} files   ${(bytes / 1024).toFixed(1).padStart(8)} KB`);

  // Top 10 largest files
  const topFiles = [...allFiles]
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map((f) => `  ${(f.size / 1024).toFixed(1).padStart(8)} KB   ${f.path}`);

  const totalKB = (totalBytes / 1024).toFixed(1);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(2);

  return [
    `Directory summary: ${dir}`,
    `Total: ${allFiles.length} files, ${totalKB} KB (${totalMB} MB)`,
    "",
    "By file type:",
    sortedCats.join("\n"),
    "",
    "Largest files:",
    topFiles.join("\n"),
  ].join("\n");
}

export const def = {
  name: "summarize_directory",
  description:
    "Produce a summary of a directory: total file count, size breakdown by file type/language, and the 10 largest files. Useful for understanding project structure at a glance.",
  parameters: {
    type: "object",
    properties: {
      dir: {
        type: "string",
        description: "Directory to summarize (default: current workspace)",
      },
      depth: {
        type: "number",
        description: "How many levels deep to scan (default: 2)",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: [],
  },
};
