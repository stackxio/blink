import { exec } from "node:child_process";

export async function git_stash(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const action = (input["action"] as string) || "list";
  const message = input["message"] as string | undefined;
  const index = typeof input["index"] === "number" ? input["index"] : 0;

  return new Promise((resolve) => {
    let cmd = "";

    switch (action) {
      case "list":
        cmd = "git stash list";
        break;
      case "save":
        cmd = `git stash push${message ? ` -m ${JSON.stringify(message)}` : ""}`;
        break;
      case "pop":
        cmd = `git stash pop stash@{${index}}`;
        break;
      case "apply":
        cmd = `git stash apply stash@{${index}}`;
        break;
      case "drop":
        cmd = `git stash drop stash@{${index}}`;
        break;
      case "show":
        cmd = `git stash show -p stash@{${index}}`;
        break;
      default:
        resolve(`Unknown action: ${action}. Use list, save, pop, apply, drop, or show.`);
        return;
    }

    exec(cmd, { cwd: root, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        resolve(`Git stash error: ${stderr || String(err)}`);
        return;
      }
      const out = stdout.trim() || "(no output)";
      resolve(`[stash ${action}] ${out}`);
    });
  });
}

export const def = {
  name: "git_stash",
  description:
    "Manage git stashes: list all stashes, save current changes to a stash, pop/apply/drop a stash by index, or show the diff of a stash.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "save", "pop", "apply", "drop", "show"],
        description: "Stash action (default: list)",
      },
      message: {
        type: "string",
        description: "Optional message for 'save' action",
      },
      index: {
        type: "number",
        description: "Stash index for pop/apply/drop/show (default: 0 = most recent)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
