import { exec } from "node:child_process";
import { resolve } from "node:path";

/** Show disk usage of a directory's top-level entries. */

export async function disk_usage(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const path = (input["path"] as string) || ".";
  const depth = typeof input["depth"] === "number" ? Math.min(input["depth"], 3) : 1;
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    const safePath = path.replace(/[`$;<>|&]/g, "");
    const cmd = `du -h -d ${depth} "${safePath}" 2>/dev/null | sort -h | tail -40`;
    exec(cmd, { cwd: absRoot, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve_fn(`No data. Error: ${String(err)}`);
        return;
      }
      resolve_fn(`Disk usage at ${path} (depth ${depth}):\n\n${out}`);
    });
  });
}

export const def = {
  name: "disk_usage",
  description:
    "Report disk usage for a directory and its top-level subdirectories using `du -h`. Sorted from smallest to largest.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to analyze (default: '.')",
      },
      depth: {
        type: "number",
        description: "Max directory depth (default: 1, max: 3)",
      },
      root: {
        type: "string",
        description: "Root directory (default: current workspace)",
      },
    },
    required: [],
  },
};
