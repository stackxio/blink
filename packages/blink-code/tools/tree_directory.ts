import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

/** Render a directory as an ASCII tree. */

const SKIP = new Set([
  "node_modules", ".git", "dist", "build", ".next", "target",
  "__pycache__", ".venv", ".cache", ".turbo", "out", ".svelte-kit",
]);

export async function tree_directory(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const path = (input["path"] as string) || ".";
  const maxDepth = typeof input["depth"] === "number" ? Math.min(input["depth"], 5) : 3;
  const showFiles = input["files"] !== false;
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);
  const absPath = path.startsWith("/") ? path : resolve(absRoot, path);

  const lines: string[] = [absPath];
  let totalDirs = 0;
  let totalFiles = 0;

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    entries = entries.filter((e) => !e.startsWith(".") || e === ".env" || e === ".gitignore").sort();

    const items: { name: string; isDir: boolean }[] = [];
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      try {
        const s = await stat(join(dir, name));
        const isDir = s.isDirectory();
        if (!showFiles && !isDir) continue;
        items.push({ name, isDir });
      } catch { /* skip */ }
    }

    for (let i = 0; i < items.length; i++) {
      const { name, isDir } = items[i];
      const isLast = i === items.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const continuation = isLast ? "    " : "│   ";
      lines.push(`${prefix}${branch}${name}${isDir ? "/" : ""}`);
      if (isDir) {
        totalDirs++;
        await walk(join(dir, name), prefix + continuation, depth + 1);
      } else {
        totalFiles++;
      }
    }
  }

  await walk(absPath, "", 1);

  lines.push("", `${totalDirs} director${totalDirs === 1 ? "y" : "ies"}, ${totalFiles} file${totalFiles === 1 ? "" : "s"}`);
  return lines.join("\n").slice(0, 8000);
}

export const def = {
  name: "tree_directory",
  description:
    "Render a directory as an ASCII tree, like the Unix `tree` command. Skips common build/cache directories (node_modules, .git, dist, target, etc.). Configurable depth.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to render (default: '.')",
      },
      depth: {
        type: "number",
        description: "Max depth to traverse (default: 3, max: 5)",
      },
      files: {
        type: "boolean",
        description: "Show files (default: true). False shows only directories.",
      },
      root: {
        type: "string",
        description: "Root directory (default: current workspace)",
      },
    },
    required: [],
  },
};
