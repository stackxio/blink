import { exec } from "node:child_process";

/** Find the largest blobs in git history. */

export async function git_largest_files(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const limit = typeof input["limit"] === "number" ? Math.min(input["limit"], 50) : 20;

  return new Promise((resolve) => {
    // List all blobs across history with size, then dedupe and pick the largest
    const cmd = `git rev-list --objects --all 2>/dev/null | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' 2>/dev/null | grep '^blob' | sort -k3 -n -r | head -${limit}`;
    exec(cmd, { cwd: root, maxBuffer: 16 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve(err ? `Git error: ${String(err)}` : "No data.");
        return;
      }
      const lines = out.split("\n").map((line) => {
        const parts = line.split(" ");
        if (parts.length < 4) return line;
        const size = parseInt(parts[2], 10);
        const name = parts.slice(3).join(" ");
        const human = size < 1024 ? `${size} B`
          : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB`
            : `${(size / 1024 / 1024).toFixed(2)} MB`;
        return `  ${human.padStart(10)}  ${name}`;
      });
      resolve(`Largest objects in git history:\n\n${lines.join("\n")}`);
    });
  });
}

export const def = {
  name: "git_largest_files",
  description:
    "Find the largest blobs in git history (across all commits). Useful for identifying bloat from accidentally committed binaries or large files.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Max number of blobs to return (default: 20, max: 50)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
