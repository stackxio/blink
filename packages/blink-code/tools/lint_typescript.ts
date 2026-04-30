import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Run TypeScript compiler in noEmit mode and return diagnostics. */

export async function lint_typescript(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const tsconfig = (input["tsconfig"] as string) || "tsconfig.json";
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  if (!existsSync(resolve(absRoot, tsconfig))) {
    return `No ${tsconfig} found at ${absRoot}.`;
  }

  return new Promise((resolve_fn) => {
    const localTsc = resolve(absRoot, "node_modules/.bin/tsc");
    const cmd = existsSync(localTsc)
      ? `${localTsc} --noEmit -p ${tsconfig} 2>&1`
      : `npx tsc --noEmit -p ${tsconfig} 2>&1`;

    exec(cmd, { cwd: absRoot, maxBuffer: 4 * 1024 * 1024, timeout: 120_000 }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out && !err) {
        resolve_fn("✓ No TypeScript errors.");
        return;
      }
      const lines = (out || "").split("\n");
      const errorLines = lines.filter((l) => /error TS\d+/.test(l));
      const summary = errorLines.length > 0
        ? `Found ${errorLines.length} TypeScript error(s):\n\n${out}`
        : out || `Error: ${String(err)}`;
      resolve_fn(summary.slice(0, 6000));
    });
  });
}

export const def = {
  name: "lint_typescript",
  description:
    "Run the TypeScript compiler in --noEmit mode to type-check the project without producing output. Returns diagnostics for any type errors found.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the TS project (default: current workspace)",
      },
      tsconfig: {
        type: "string",
        description: "Path to tsconfig.json relative to root (default: tsconfig.json)",
      },
    },
    required: [],
  },
};
