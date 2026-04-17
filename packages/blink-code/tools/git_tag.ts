import { exec } from "node:child_process";

export async function git_tag(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const action = (input["action"] as string) || "list";
  const name = input["name"] as string | undefined;
  const message = input["message"] as string | undefined;
  const commit = input["commit"] as string | undefined;

  return new Promise((resolve) => {
    let cmd = "";

    switch (action) {
      case "list":
        cmd = "git tag --sort=-version:refname";
        break;
      case "create":
        if (!name) { resolve("Error: name is required for 'create'."); return; }
        cmd = message
          ? `git tag -a ${name} -m ${JSON.stringify(message)}${commit ? ` ${commit}` : ""}`
          : `git tag ${name}${commit ? ` ${commit}` : ""}`;
        break;
      case "delete":
        if (!name) { resolve("Error: name is required for 'delete'."); return; }
        cmd = `git tag -d ${name}`;
        break;
      case "show":
        if (!name) { resolve("Error: name is required for 'show'."); return; }
        cmd = `git show ${name} --stat`;
        break;
      case "latest":
        cmd = "git describe --tags --abbrev=0 2>/dev/null || echo '(no tags)'";
        break;
      default:
        resolve(`Unknown action: ${action}. Use list, create, delete, show, or latest.`);
        return;
    }

    exec(cmd, { cwd: root, maxBuffer: 1024 * 1024, shell: "/bin/sh" }, (err, stdout, stderr) => {
      if (err && !stdout) {
        resolve(`Git tag error: ${stderr || String(err)}`);
        return;
      }
      const out = stdout.trim() || stderr.trim() || "Done.";
      resolve(`[tag ${action}] ${out}`);
    });
  });
}

export const def = {
  name: "git_tag",
  description:
    "Manage git tags: list all, create (annotated or lightweight), delete, show details of a tag, or get the latest tag name.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "create", "delete", "show", "latest"],
        description: "Tag action (default: list)",
      },
      name: {
        type: "string",
        description: "Tag name (required for create, delete, show)",
      },
      message: {
        type: "string",
        description: "Annotation message for annotated tags (optional, for 'create')",
      },
      commit: {
        type: "string",
        description: "Commit hash or ref to tag (optional, for 'create', defaults to HEAD)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
