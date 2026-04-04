import { exec } from "node:child_process";

/** Returns true if the `codex` CLI is found on PATH. */
export function detectCodex(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("which codex", (err) => resolve(!err));
  });
}
