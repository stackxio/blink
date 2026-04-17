import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

async function detectTestCommand(root: string): Promise<string | null> {
  // package.json — prefer vitest > jest > test script
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf-8"));
    const scripts: Record<string, string> = pkg.scripts ?? {};
    if (scripts.test) {
      const t = scripts.test;
      if (t.includes("vitest")) return "bun run vitest run";
      if (t.includes("jest")) return "bun run jest --passWithNoTests";
      return "bun run test";
    }
    // devDependencies hint
    const dev: Record<string, string> = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
    if (dev.vitest) return "bun run vitest run";
    if (dev.jest) return "bun run jest --passWithNoTests";
  } catch {}

  // Cargo.toml → cargo test
  try {
    await fs.access(path.join(root, "Cargo.toml"));
    return "cargo test 2>&1";
  } catch {}

  // pyproject.toml / setup.py → pytest
  try {
    await fs.access(path.join(root, "pyproject.toml"));
    return "python -m pytest -v";
  } catch {}
  try {
    await fs.access(path.join(root, "setup.py"));
    return "python -m pytest -v";
  } catch {}

  // go.mod → go test
  try {
    await fs.access(path.join(root, "go.mod"));
    return "go test ./...";
  } catch {}

  return null;
}

export async function run_tests(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const customCommand = input["command"] as string | undefined;

  const command = customCommand ?? (await detectTestCommand(root));

  if (!command) {
    return (
      "Could not detect a test runner in this project.\n" +
      "Supported: package.json test script (jest/vitest), Cargo.toml (cargo test), " +
      "pyproject.toml/setup.py (pytest), go.mod (go test).\n" +
      "Provide a custom command via the `command` parameter."
    );
  }

  return new Promise((resolve) => {
    exec(
      command,
      { cwd: root, maxBuffer: 5 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => {
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        const truncated = out.length > 8000 ? out.slice(0, 8000) + "\n[truncated]" : out;
        const status = err ? `❌ Tests failed (exit ${err.code ?? "?"})` : "✅ Tests passed";
        resolve(`Command: ${command}\n${status}\n\n${truncated}`);
      },
    );
  });
}

export const def = {
  name: "run_tests",
  description:
    "Run the project's test suite. Auto-detects the test runner from package.json (jest/vitest), Cargo.toml, pyproject.toml, or go.mod. You can also provide a custom command.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the project (default: current workspace)",
      },
      command: {
        type: "string",
        description:
          "Override the detected test command (e.g. 'cargo test --lib', 'pytest tests/unit')",
      },
    },
    required: [],
  },
};
