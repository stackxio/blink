import { exec } from "node:child_process";

/** Find local branches that aren't merged into main/master. */

export async function git_unmerged(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const base = (input["base"] as string) || "main";

  return new Promise((resolve) => {
    const safeBase = base.replace(/[^a-zA-Z0-9_/.\-]/g, "");
    // First check if base exists, otherwise fall back to master
    exec(`git rev-parse --verify ${safeBase} 2>/dev/null || git rev-parse --verify master`, {
      cwd: root,
    }, (_, baseSha) => {
      const baseRef = baseSha.trim() ? safeBase : "master";

      const cmd = `git for-each-ref --format='%(refname:short)|%(authordate:relative)|%(authorname)' refs/heads/ 2>&1`;
      exec(cmd, { cwd: root, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        if (err && !stdout) {
          resolve(`Git error: ${String(err)}`);
          return;
        }

        const branches = stdout.trim().split("\n").filter(Boolean);
        const checkPromises = branches.map((entry) =>
          new Promise<string | null>((r) => {
            const [name, date, author] = entry.split("|");
            if (name === baseRef) return r(null);
            exec(`git merge-base --is-ancestor ${name} ${baseRef}`, { cwd: root }, (mErr) => {
              if (mErr) r(`  ${name.padEnd(40)} ${date.padEnd(20)} ${author}`);
              else r(null);
            });
          }),
        );

        Promise.all(checkPromises).then((results) => {
          const unmerged = results.filter((r): r is string => r != null);
          if (unmerged.length === 0) {
            resolve(`✓ All branches are merged into ${baseRef}.`);
            return;
          }
          resolve([
            `${unmerged.length} branch(es) not merged into ${baseRef}:`,
            "",
            ...unmerged,
          ].join("\n"));
        });
      });
    });
  });
}

export const def = {
  name: "git_unmerged",
  description:
    "Find local branches that have commits not yet merged into a base branch (default: main). Useful before cleanup or before deleting branches.",
  parameters: {
    type: "object",
    properties: {
      base: {
        type: "string",
        description: "Base branch to compare against (default: main, falls back to master)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
