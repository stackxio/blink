import { exec } from "node:child_process";

export async function git_log(input: Record<string, unknown>): Promise<string> {
  const cwd = (input["cwd"] as string | undefined) || process.cwd();
  const n = Math.min(Number(input["n"] ?? 20), 100);
  return new Promise((resolve) => {
    exec(`git log --oneline --decorate -${n}`, { cwd }, (_err, stdout, stderr) => {
      resolve(stdout.trim() || stderr.trim() || "(no commits)");
    });
  });
}

export const def = {
  name: "git_log",
  description: "Show recent git commit history.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root (optional)" },
      n: { type: "number", description: "Number of commits to show (default 20, max 100)" },
    },
  },
};
