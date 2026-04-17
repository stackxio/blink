import { exec } from "node:child_process";

/** Get information about the current branch's pull request (via gh CLI). */

export async function git_pr_info(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const action = (input["action"] as string) || "view";
  const number = input["number"] as number | undefined;

  return new Promise((resolve) => {
    let cmd = "";

    switch (action) {
      case "view":
        cmd = number
          ? `gh pr view ${number} 2>&1`
          : `gh pr view 2>&1`;
        break;
      case "list":
        cmd = `gh pr list --limit 20 2>&1`;
        break;
      case "checks":
        cmd = number
          ? `gh pr checks ${number} 2>&1`
          : `gh pr checks 2>&1`;
        break;
      case "diff":
        cmd = number
          ? `gh pr diff ${number} 2>&1 | head -100`
          : `gh pr diff 2>&1 | head -100`;
        break;
      case "review":
        cmd = `gh pr list --review-requested @me --limit 10 2>&1`;
        break;
      default:
        resolve(`Unknown action: ${action}. Use: view, list, checks, diff, review`);
        return;
    }

    exec(cmd, { cwd: root, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh", timeout: 30_000 }, (err, stdout, stderr) => {
      const out = stdout?.trim() || stderr?.trim();
      if (!out) {
        resolve(err ? `gh CLI error: ${String(err)}` : "No output. Is gh CLI installed and authenticated?");
        return;
      }
      resolve(out.slice(0, 5000));
    });
  });
}

export const def = {
  name: "git_pr_info",
  description:
    "Get GitHub Pull Request information using the gh CLI: view the current branch's PR, list open PRs, check CI status, view the diff, or see PRs awaiting your review.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["view", "list", "checks", "diff", "review"],
        description: "Action: view current PR, list all, check CI, show diff, or see PRs awaiting review (default: view)",
      },
      number: {
        type: "number",
        description: "PR number (optional, defaults to current branch's PR)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
