import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function dependency_check(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();

  // Check for package.json (Node)
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf-8")) as Record<string, unknown>;
    const deps = { ...(pkg.dependencies as Record<string, string> ?? {}), ...(pkg.devDependencies as Record<string, string> ?? {}) };
    const name = typeof pkg.name === "string" ? pkg.name : path.basename(root);
    const depCount = Object.keys(deps).length;

    return new Promise((resolve) => {
      exec(`npm outdated --json 2>/dev/null || echo "{}"`, { cwd: root, maxBuffer: 5 * 1024 * 1024 }, (_err, stdout) => {
        let outdated: Record<string, { current: string; wanted: string; latest: string }> = {};
        try { outdated = JSON.parse(stdout || "{}"); } catch {}

        const lines = [
          `Package: ${name}`,
          `Total dependencies: ${depCount}`,
          `Outdated: ${Object.keys(outdated).length}`,
          "",
        ];

        if (Object.keys(outdated).length > 0) {
          lines.push("Outdated packages:");
          for (const [pkg, info] of Object.entries(outdated)) {
            lines.push(`  ${pkg}: ${info.current} → ${info.latest} (wanted: ${info.wanted})`);
          }
        } else {
          lines.push("All packages are up to date (or npm outdated not available).");
        }
        resolve(lines.join("\n"));
      });
    });
  } catch {}

  // Check Cargo.toml (Rust)
  try {
    await fs.access(path.join(root, "Cargo.toml"));
    return new Promise((resolve) => {
      exec(`cargo outdated 2>&1 || cargo tree 2>&1 | head -30`, { cwd: root, maxBuffer: 5 * 1024 * 1024 }, (_err, stdout) => {
        resolve(stdout.trim() || "Could not check Rust dependencies (try `cargo outdated`).");
      });
    });
  } catch {}

  return `No supported package manager found in ${root} (looked for package.json, Cargo.toml).`;
}

export const def = {
  name: "dependency_check",
  description:
    "Check project dependencies for outdated packages. Works with npm/bun (package.json) and Cargo (Cargo.toml). Returns a list of packages that have newer versions available.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the project (default: current workspace)",
      },
    },
    required: [],
  },
};
