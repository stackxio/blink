import { exec } from "node:child_process";

/** Show the details of a specific git commit. */

export async function git_show(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const commit = (input["commit"] as string) || "HEAD";
  const statOnly = input["stat_only"] === true;

  return new Promise((resolve) => {
    const flag = statOnly ? "--stat" : "--stat -p";
    const safeCommit = commit.replace(/[^a-zA-Z0-9_/.\-^~]/g, "");
    const cmd = `git show ${flag} ${safeCommit} 2>&1`;

    exec(cmd, { cwd: root, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve(`Git show error: ${String(err)}`);
        return;
      }
      resolve(out.slice(0, 8000));
    });
  });
}

export const def = {
  name: "git_show",
  description:
    "Show the contents of a specific git commit including the message, stats, and diff. Defaults to HEAD if no commit is specified.",
  parameters: {
    type: "object",
    properties: {
      commit: {
        type: "string",
        description: "Commit hash, branch name, or ref (default: HEAD)",
      },
      stat_only: {
        type: "boolean",
        description: "Show only file stats without the full diff (default: false)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
