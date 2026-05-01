import { exec } from "node:child_process";
import { resolve } from "node:path";

/** Show a unified diff between two files (side-by-side optional). */

export async function file_diff(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const a = input["a"] as string;
  const b = input["b"] as string;
  const sideBySide = input["side_by_side"] === true;

  if (!a || !b) return "Error: both a and b file paths are required.";

  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);
  const absA = a.startsWith("/") ? a : resolve(absRoot, a);
  const absB = b.startsWith("/") ? b : resolve(absRoot, b);

  return new Promise((resolve_fn) => {
    const flag = sideBySide ? "-y -W 160" : "-u";
    const cmd = `diff ${flag} "${absA}" "${absB}" 2>&1`;
    exec(cmd, { cwd: absRoot, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out && !err) {
        resolve_fn("✓ Files are identical.");
        return;
      }
      resolve_fn((out || `Error: ${String(err)}`).slice(0, 8000));
    });
  });
}

export const def = {
  name: "file_diff",
  description:
    "Show a unified or side-by-side diff between two files. Use side_by_side:true for a column comparison.",
  parameters: {
    type: "object",
    properties: {
      a: {
        type: "string",
        description: "First file path",
      },
      b: {
        type: "string",
        description: "Second file path",
      },
      side_by_side: {
        type: "boolean",
        description: "Use side-by-side format instead of unified (default: false)",
      },
      root: {
        type: "string",
        description: "Root directory for relative paths (default: current workspace)",
      },
    },
    required: ["a", "b"],
  },
};
