import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Run prettier --check to find unformatted files. */

export async function prettier_check(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const pattern = (input["pattern"] as string) || "**/*.{ts,tsx,js,jsx,json,md,css,scss}";
  const fix = input["fix"] === true;
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    const localPrettier = resolve(absRoot, "node_modules/.bin/prettier");
    const bin = existsSync(localPrettier) ? localPrettier : "npx prettier";
    const flag = fix ? "--write" : "--check";
    const cmd = `${bin} ${flag} "${pattern}" 2>&1`;

    exec(cmd, { cwd: absRoot, maxBuffer: 4 * 1024 * 1024, timeout: 60_000 }, (err, stdout) => {
      const out = stdout?.trim() || "";
      if (!err && (!out || out.includes("All matched files use Prettier"))) {
        resolve_fn(fix ? "✓ All files formatted." : "✓ All files match Prettier formatting.");
        return;
      }
      resolve_fn(out.slice(0, 4000) || `Error: ${String(err)}`);
    });
  });
}

export const def = {
  name: "prettier_check",
  description:
    "Run Prettier in --check mode to find unformatted files, or --write mode to format them. Uses the local prettier installation if available.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory (default: current workspace)",
      },
      pattern: {
        type: "string",
        description: "Glob pattern of files to check (default: **/*.{ts,tsx,js,jsx,json,md,css,scss})",
      },
      fix: {
        type: "boolean",
        description: "Apply formatting instead of just checking (default: false)",
      },
    },
    required: [],
  },
};
