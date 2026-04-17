import { exec } from "node:child_process";

export async function file_history(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const root = (input["root"] as string) || process.cwd();
  const limit = typeof input["limit"] === "number" ? input["limit"] : 15;

  return new Promise((resolve) => {
    exec(
      `git log --oneline --follow -${limit} -- ${JSON.stringify(filePath)}`,
      { cwd: root, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          resolve(`Git error: ${stderr || String(err)}`);
          return;
        }
        const commits = stdout.trim();
        if (!commits) {
          resolve(`No git history found for: ${filePath}`);
          return;
        }
        resolve(`Git history for ${filePath}:\n${commits}`);
      },
    );
  });
}

export const def = {
  name: "file_history",
  description:
    "Show the git commit history for a specific file, including renames (--follow). Useful for understanding how a file has evolved.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file (absolute or relative to root)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
      limit: {
        type: "number",
        description: "Maximum number of commits to show (default: 15)",
      },
    },
    required: ["path"],
  },
};
