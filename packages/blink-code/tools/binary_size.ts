import { exec } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

/** Report the size of a built binary or build artifact, with breakdown if possible. */

export async function binary_size(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const path = input["path"] as string;
  if (!path) return "Error: path is required.";

  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);
  const absPath = path.startsWith("/") ? path : resolve(absRoot, path);

  let size: number;
  try {
    const s = await stat(absPath);
    size = s.size;
  } catch (e) {
    return `Cannot stat ${absPath}: ${String(e)}`;
  }

  const human = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const lines = [`File: ${absPath}`, `Size: ${human(size)} (${size.toLocaleString()} bytes)`];

  // Try `size` (BSD/Linux ELF size tool) for compiled binaries
  return new Promise((resolve_fn) => {
    exec(`size "${absPath}" 2>/dev/null`, { maxBuffer: 1024 * 1024 }, (_, stdout) => {
      if (stdout?.trim()) {
        lines.push("", "Section sizes:", stdout.trim());
      }
      resolve_fn(lines.join("\n"));
    });
  });
}

export const def = {
  name: "binary_size",
  description:
    "Report the size of a binary or any file, in human-readable form. For native binaries, also reports per-section sizes (text, data, bss) using the `size` tool.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file (relative to root, or absolute)",
      },
      root: {
        type: "string",
        description: "Root directory (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
