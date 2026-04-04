import { exec } from "node:child_process";

/** Returns true if the `claude` CLI is found on PATH. */
export function detectClaude(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("which claude", (err: Error | null) => resolve(!err));
  });
}
