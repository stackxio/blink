import { exec } from "node:child_process";

export async function git_branch(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const action = (input["action"] as string) || "list";
  const name = input["name"] as string | undefined;
  const from = input["from"] as string | undefined;

  return new Promise((resolve) => {
    let cmd = "";

    switch (action) {
      case "list":
        cmd = "git branch -a --sort=-committerdate";
        break;
      case "current":
        cmd = "git branch --show-current";
        break;
      case "create":
        if (!name) { resolve("Error: name is required for 'create' action."); return; }
        cmd = from ? `git checkout -b ${name} ${from}` : `git checkout -b ${name}`;
        break;
      case "switch":
        if (!name) { resolve("Error: name is required for 'switch' action."); return; }
        cmd = `git checkout ${name}`;
        break;
      case "delete":
        if (!name) { resolve("Error: name is required for 'delete' action."); return; }
        cmd = `git branch -d ${name}`;
        break;
      case "merged":
        cmd = "git branch --merged";
        break;
      default:
        resolve(`Unknown action: ${action}. Use list, current, create, switch, delete, or merged.`);
        return;
    }

    exec(cmd, { cwd: root, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        resolve(`Git branch error: ${stderr || String(err)}`);
        return;
      }
      const out = stdout.trim() || stderr.trim() || "Done.";
      resolve(`[${action}] ${out}`);
    });
  });
}

export const def = {
  name: "git_branch",
  description:
    "Manage git branches: list all, get current, create, switch, delete, or list merged branches.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "current", "create", "switch", "delete", "merged"],
        description: "Branch action (default: list)",
      },
      name: {
        type: "string",
        description: "Branch name (required for create, switch, delete)",
      },
      from: {
        type: "string",
        description: "Base branch or commit to create from (optional, for 'create')",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
