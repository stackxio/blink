import * as fs from "node:fs/promises";

const IGNORE = new Set([
  "node_modules", ".git", "dist", "target", ".next",
  "build", "__pycache__", ".cache",
]);

async function walk(dir: string, depth: number, maxDepth: number, prefix: string): Promise<string[]> {
  if (depth > maxDepth) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const lines: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (IGNORE.has(e.name) || e.name.startsWith(".")) continue;
    const isLast = i === sorted.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    lines.push(`${prefix}${connector}${e.name}${e.isDirectory() ? "/" : ""}`);
    if (e.isDirectory()) {
      const children = await walk(`${dir}/${e.name}`, depth + 1, maxDepth, prefix + childPrefix);
      lines.push(...children);
    }
  }
  return lines;
}

export async function file_tree(input: Record<string, unknown>): Promise<string> {
  const root = input["path"] as string;
  const maxDepth = Math.min(Number(input["max_depth"] ?? 4), 8);
  const tree = await walk(root, 1, maxDepth, "");
  if (tree.length === 0) return "(empty)";
  if (tree.length > 500) {
    return (
      tree.slice(0, 500).join("\n") +
      `\n\n[Truncated — ${tree.length} entries total, showing first 500]`
    );
  }
  return tree.join("\n");
}

export const def = {
  name: "file_tree",
  description:
    "Recursively list a directory as a tree. Skips node_modules, .git, dist, and hidden files.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the root directory" },
      max_depth: {
        type: "number",
        description: "Maximum depth to recurse (default 4, max 8)",
      },
    },
    required: ["path"],
  },
};
