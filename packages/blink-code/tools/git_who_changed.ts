import { exec } from "node:child_process";

/** Show which authors have touched a file or directory and how often. */

export async function git_who_changed(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const path = input["path"] as string;
  const since = (input["since"] as string) || "";

  if (!path) return "Error: path is required.";

  const sinceFlag = since ? `--since="${since.replace(/"/g, "")}"` : "";
  const safePath = path.replace(/[`$;<>|&]/g, "");

  return new Promise((resolve) => {
    const cmd = `git log ${sinceFlag} --pretty=format:"%an" -- "${safePath}" 2>&1 | sort | uniq -c | sort -rn | head -20`;
    exec(cmd, { cwd: root, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve(err ? `Git error: ${String(err)}` : "No commits found for this path.");
        return;
      }
      const lines = out.split("\n").map((l) => {
        const m = l.trim().match(/^(\d+)\s+(.+)$/);
        return m ? `  ${m[1].padStart(4)} commit(s)  ${m[2]}` : `  ${l.trim()}`;
      });
      resolve(`Authors who changed ${path}${since ? ` since ${since}` : ""}:\n\n${lines.join("\n")}`);
    });
  });
}

export const def = {
  name: "git_who_changed",
  description:
    "Show which authors have committed changes to a given file or directory, with commit counts. Optionally filter by a 'since' date.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File or directory path (relative to root)",
      },
      since: {
        type: "string",
        description: "Only count commits since this date (e.g. '2 weeks ago', '2024-01-01')",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
