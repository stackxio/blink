import { exec } from "node:child_process";

export async function git_status(input: Record<string, unknown>): Promise<string> {
  const cwd = (input["cwd"] as string | undefined) || process.cwd();
  return new Promise((resolve) => {
    exec("git status --short", { cwd }, (_err, stdout, stderr) => {
      resolve(stdout.trim() || stderr.trim() || "(no changes)");
    });
  });
}

export const def = {
  name: "git_status",
  description: "Show the working tree status (modified, added, deleted files).",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root (optional, defaults to workspace)" },
    },
  },
};
