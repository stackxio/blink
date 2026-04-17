import { exec } from "node:child_process";

/** Show git contribution statistics by author: commit count, lines added/removed. */

export async function git_author_stats(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const since = input["since"] as string | undefined; // e.g. "6 months ago"
  const file = input["file"] as string | undefined;

  return new Promise((resolve) => {
    const sinceFlag = since ? `--since="${since}"` : "";
    const fileFilter = file ? `-- ${JSON.stringify(file)}` : "";

    // Get commit counts per author
    const shortlogCmd = `git shortlog -sn --no-merges ${sinceFlag} ${fileFilter} HEAD 2>/dev/null | head -30`;

    exec(shortlogCmd, { cwd: root, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      if (err && !stdout) {
        resolve(`Git error: ${String(err)}`);
        return;
      }

      const commitLines = stdout.trim().split("\n").filter(Boolean).map((line) => {
        const m = line.match(/^\s*(\d+)\s+(.+)$/);
        return m ? { count: parseInt(m[1], 10), author: m[2] } : null;
      }).filter(Boolean) as Array<{ count: number; author: string }>;

      if (commitLines.length === 0) {
        resolve("No commit history found.");
        return;
      }

      // Get line stats per author (can be slow, so limit to top 10)
      const totalCommits = commitLines.reduce((s, a) => s + a.count, 0);
      const topAuthors = commitLines.slice(0, 10);

      const header = [
        `Git contributions${since ? ` (since ${since})` : ""}${file ? ` for ${file}` : ""}:`,
        `Total commits: ${totalCommits}`,
        "",
        "Author".padEnd(35) + "Commits".padStart(8) + " (%)",
        "-".repeat(50),
      ];

      const rows = topAuthors.map((a) => {
        const pct = ((a.count / totalCommits) * 100).toFixed(1);
        return `${a.author.slice(0, 34).padEnd(35)}${String(a.count).padStart(8)}  (${pct}%)`;
      });

      if (commitLines.length > 10) {
        const rest = commitLines.slice(10).reduce((s, a) => s + a.count, 0);
        rows.push(`... ${commitLines.length - 10} more authors`.padEnd(35) + String(rest).padStart(8));
      }

      resolve([...header, ...rows].join("\n"));
    });
  });
}

export const def = {
  name: "git_author_stats",
  description:
    "Show git commit statistics broken down by author: commit counts and percentages. Optionally filter by time period (e.g. 'since: 6 months ago') or a specific file.",
  parameters: {
    type: "object",
    properties: {
      since: {
        type: "string",
        description: "Only count commits since this time (e.g. '3 months ago', '2024-01-01')",
      },
      file: {
        type: "string",
        description: "Only count commits that touched this file",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
