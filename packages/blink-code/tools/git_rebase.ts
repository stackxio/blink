import { exec } from "node:child_process";

export async function git_rebase(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const onto = input["onto"] as string | undefined;
  const abort = input["abort"] === true;
  const continueRebase = input["continue"] === true;
  const skipCommit = input["skip"] === true;

  return new Promise((resolve) => {
    let cmd = "";

    if (abort) {
      cmd = "git rebase --abort";
    } else if (continueRebase) {
      cmd = "GIT_EDITOR=true git rebase --continue";
    } else if (skipCommit) {
      cmd = "git rebase --skip";
    } else if (onto) {
      cmd = `git rebase ${onto}`;
    } else {
      resolve("Error: specify 'onto' branch, or set 'abort', 'continue', or 'skip'.");
      return;
    }

    exec(cmd, { cwd: root, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh", timeout: 60_000 }, (err, stdout, stderr) => {
      const out = (stdout + stderr).trim();
      if (!out && err) {
        resolve(`Rebase error: ${String(err)}`);
        return;
      }
      resolve(out || "Done.");
    });
  });
}

export const def = {
  name: "git_rebase",
  description:
    "Rebase the current branch onto another branch, or manage an in-progress rebase (abort, continue, skip a commit).",
  parameters: {
    type: "object",
    properties: {
      onto: {
        type: "string",
        description: "Branch or commit to rebase onto (e.g. 'main', 'origin/main')",
      },
      abort: {
        type: "boolean",
        description: "Abort an in-progress rebase",
      },
      continue: {
        type: "boolean",
        description: "Continue a paused rebase (after resolving conflicts)",
      },
      skip: {
        type: "boolean",
        description: "Skip the current commit during a rebase",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
