import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Common install locations for globally installed CLIs that may not be on
// the minimal PATH Tauri/Bun inherits from launchd on macOS.
function extendedPath(): string {
  const home = os.homedir();
  const extra = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${home}/.npm-global/bin`,
    `${home}/.local/bin`,
    `${home}/.yarn/bin`,
    `${home}/.bun/bin`,
  ];
  const current = process.env.PATH ?? "";
  return [...extra, ...current.split(":")].join(":");
}

async function findInPath(bin: string): Promise<boolean> {
  const dirs = extendedPath().split(":");
  for (const dir of dirs) {
    try {
      await fs.access(path.join(dir, bin));
      return true;
    } catch {
      // not here
    }
  }
  return false;
}

/** Returns true if the `codex` CLI is found on PATH. */
export async function detectCodex(): Promise<boolean> {
  return findInPath("codex");
}
