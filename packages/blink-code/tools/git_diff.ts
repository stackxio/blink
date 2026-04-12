import { exec } from "node:child_process";

export async function git_diff(input: Record<string, unknown>): Promise<string> {
  const cwd = (input["cwd"] as string | undefined) || process.cwd();
  const staged = Boolean(input["staged"]);
  const cmd = staged ? "git diff --staged" : "git diff HEAD";
  return new Promise((resolve) => {
    exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (_err, stdout) => {
      const result = stdout.trim();
      if (!result) resolve("(no diff)");
      else resolve(result.length > 8_000 ? result.slice(0, 8_000) + "\n...[truncated]" : result);
    });
  });
}

export const def = {
  name: "git_diff",
  description: "Show git diff for uncommitted changes.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root (optional)" },
      staged: {
        type: "boolean",
        description: "If true, show staged diff instead of working tree",
      },
    },
  },
};
