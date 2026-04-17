import { exec } from "node:child_process";

export async function compare_branches(input: Record<string, unknown>): Promise<string> {
  const base = (input["base"] as string) || "main";
  const head = (input["head"] as string) || "HEAD";
  const root = (input["root"] as string) || process.cwd();
  const statOnly = input["stat_only"] === true;

  return new Promise((resolve) => {
    const statCmd = `git diff --stat ${base}...${head}`;
    const diffCmd = `git diff ${base}...${head}`;

    exec(statCmd, { cwd: root, maxBuffer: 2 * 1024 * 1024 }, (err, statOut, statErr) => {
      if (err && !statOut) {
        resolve(`Git diff error: ${statErr || String(err)}`);
        return;
      }

      if (statOnly) {
        const logCmd = `git log --oneline ${base}..${head}`;
        exec(logCmd, { cwd: root, maxBuffer: 1024 * 1024 }, (_, logOut) => {
          const commits = logOut.trim() || "(no commits)";
          resolve(
            `Commits in ${head} not in ${base}:\n${commits}\n\nChanged files:\n${statOut.trim()}`,
          );
        });
        return;
      }

      exec(diffCmd, { cwd: root, maxBuffer: 4 * 1024 * 1024 }, (err2, diffOut) => {
        const diff = diffOut?.slice(0, 30_000) || "(no diff)";
        const truncated = diffOut?.length > 30_000 ? `\n... [truncated at 30k chars]` : "";
        resolve(
          `Diff ${base}...${head}\n\nStat:\n${statOut.trim()}\n\nFull diff:\n${diff}${truncated}`,
        );
      });
    });
  });
}

export const def = {
  name: "compare_branches",
  description:
    "Compare two git branches or commits. Shows a stat summary of changed files and optionally the full diff. Useful for reviewing what a feature branch changes.",
  parameters: {
    type: "object",
    properties: {
      base: {
        type: "string",
        description: "Base branch or commit (default: main)",
      },
      head: {
        type: "string",
        description: "Head branch or commit to compare against base (default: HEAD)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
      stat_only: {
        type: "boolean",
        description: "If true, only return file stats and commit list without full diff (default: false)",
      },
    },
    required: [],
  },
};
