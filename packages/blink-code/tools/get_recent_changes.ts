import { exec } from "node:child_process";

export async function get_recent_changes(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const since = (input["since"] as string) ?? "1 week ago";
  const limit = typeof input["limit"] === "number" ? input["limit"] : 20;
  const author = input["author"] as string | undefined;

  const authorFlag = author ? `--author=${JSON.stringify(author)}` : "";
  const command = `git log --oneline --no-merges ${authorFlag} --since=${JSON.stringify(since)} -${limit}`;

  return new Promise((resolve) => {
    exec(command, { cwd: root, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        resolve(`Git error: ${stderr || String(err)}`);
        return;
      }
      const commits = stdout.trim();
      if (!commits) {
        resolve(`No commits found since "${since}".`);
        return;
      }

      // Also get a summary of changed files
      exec(
        `git diff --stat HEAD~${Math.min(limit, 5)} HEAD 2>/dev/null | tail -5`,
        { cwd: root, maxBuffer: 2 * 1024 * 1024 },
        (_e2, diffStat) => {
          const lines = [`Recent commits (since ${since}):`, commits];
          if (diffStat?.trim()) {
            lines.push("", "Recent file changes:", diffStat.trim());
          }
          resolve(lines.join("\n"));
        },
      );
    });
  });
}

export const def = {
  name: "get_recent_changes",
  description:
    "Show recent git commits and changed files. Useful for understanding what has changed in the codebase recently.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
      since: {
        type: "string",
        description: "Time range in git format (default: '1 week ago'). E.g. '2 days ago', '2024-01-01'.",
      },
      limit: {
        type: "number",
        description: "Maximum number of commits to return (default: 20)",
      },
      author: {
        type: "string",
        description: "Filter by author name or email",
      },
    },
    required: [],
  },
};
