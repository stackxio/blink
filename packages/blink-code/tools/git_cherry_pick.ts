import { exec } from "node:child_process";

export async function git_cherry_pick(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const commit = input["commit"] as string;
  const abort = input["abort"] === true;
  const nCommit = input["no_commit"] === true;

  if (!commit && !abort) return "Error: commit hash is required (or set abort: true to abort).";

  return new Promise((resolve) => {
    let cmd = "";
    if (abort) {
      cmd = "git cherry-pick --abort";
    } else {
      cmd = `git cherry-pick${nCommit ? " -n" : ""} ${commit}`;
    }

    exec(cmd, { cwd: root, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = (stdout + stderr).trim();
      if (err && !stdout && !out) {
        resolve(`Cherry-pick error: ${String(err)}`);
        return;
      }
      resolve(out || (abort ? "Cherry-pick aborted." : `Cherry-picked ${commit}.`));
    });
  });
}

export const def = {
  name: "git_cherry_pick",
  description:
    "Apply a specific commit from another branch to the current branch. Can also abort an in-progress cherry-pick. Use no_commit to stage changes without committing.",
  parameters: {
    type: "object",
    properties: {
      commit: {
        type: "string",
        description: "Commit hash to cherry-pick",
      },
      abort: {
        type: "boolean",
        description: "If true, abort an in-progress cherry-pick (default: false)",
      },
      no_commit: {
        type: "boolean",
        description: "If true, apply changes but don't create a commit (default: false)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
