import { exec } from "node:child_process";

/** Show summarized diff stats — lines added/removed by file in a range. */

export async function diff_stats(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const from = (input["from"] as string) || "HEAD~1";
  const to = (input["to"] as string) || "HEAD";

  const safeFrom = from.replace(/[^a-zA-Z0-9_/.\-^~]/g, "");
  const safeTo = to.replace(/[^a-zA-Z0-9_/.\-^~]/g, "");

  return new Promise((resolve) => {
    const cmd = `git diff --stat ${safeFrom}..${safeTo} 2>&1`;
    exec(cmd, { cwd: root, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve(`No changes between ${from} and ${to}.${err ? ` Error: ${err}` : ""}`);
        return;
      }
      resolve(`Changes from ${from} to ${to}:\n\n${out}`);
    });
  });
}

export const def = {
  name: "diff_stats",
  description:
    "Show summarized diff statistics (files changed, lines added/removed) between two git refs using `git diff --stat`.",
  parameters: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "Starting ref (default: HEAD~1)",
      },
      to: {
        type: "string",
        description: "Ending ref (default: HEAD)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
