import { exec } from "node:child_process";

/** List recently modified files in the working tree, sorted by mtime. */

export async function git_recent_files(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const limit = typeof input["limit"] === "number" ? Math.min(input["limit"], 100) : 30;

  return new Promise((resolve) => {
    const cmd = `git log --name-only --pretty=format: -n 100 2>/dev/null | grep -v '^$' | awk '!seen[$0]++' | head -${limit}`;
    exec(cmd, { cwd: root, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve(`No recent files. Error: ${String(err)}`);
        return;
      }
      const files = out.split("\n");
      resolve(`${files.length} recently changed file(s):\n\n${files.map((f) => `  ${f}`).join("\n")}`);
    });
  });
}

export const def = {
  name: "git_recent_files",
  description:
    "List the most recently modified files in the repository (deduplicated, in order of most recent commit touch). Useful to find what's been actively worked on.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Max number of files to return (default: 30, max: 100)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
