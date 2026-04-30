import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** List all imports from a TS/JS file, grouped by external vs local. */

export async function list_imports(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const file = input["file"] as string;
  if (!file) return "Error: file is required.";

  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);
  const absFile = file.startsWith("/") ? file : resolve(absRoot, file);

  let content: string;
  try {
    content = await readFile(absFile, "utf8");
  } catch (e) {
    return `Cannot read ${absFile}: ${String(e)}`;
  }

  const importRe = /(?:import|from)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  const imports: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    const spec = m[1] || m[2];
    if (spec) imports.push(spec);
  }

  const unique = Array.from(new Set(imports));
  const local = unique.filter((s) => s.startsWith(".") || s.startsWith("/"));
  const external = unique.filter((s) => !s.startsWith(".") && !s.startsWith("/"));

  const lines: string[] = [`Imports in ${file}:`, ""];
  if (external.length > 0) {
    lines.push(`External (${external.length}):`);
    external.sort().forEach((s) => lines.push(`  ${s}`));
    lines.push("");
  }
  if (local.length > 0) {
    lines.push(`Local (${local.length}):`);
    local.sort().forEach((s) => lines.push(`  ${s}`));
  }

  if (unique.length === 0) lines.push("No imports found.");
  return lines.join("\n");
}

export const def = {
  name: "list_imports",
  description:
    "List all imports in a TypeScript/JavaScript file, grouped by external (npm packages) and local (relative paths) imports.",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to the file (relative to root, or absolute)",
      },
      root: {
        type: "string",
        description: "Root directory (default: current workspace)",
      },
    },
    required: ["file"],
  },
};
