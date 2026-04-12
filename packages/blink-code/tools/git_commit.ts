import { exec } from "node:child_process";

export async function git_commit(input: Record<string, unknown>): Promise<string> {
  const cwd = (input["cwd"] as string | undefined) || process.cwd();
  const message = input["message"] as string;
  const files = input["files"] as string[] | undefined;
  if (!message?.trim()) throw new Error("commit message is required");
  return new Promise((resolve) => {
    const stageCmd = files?.length
      ? `git add ${files.map((f) => JSON.stringify(f)).join(" ")}`
      : "git add -A";
    exec(
      `${stageCmd} && git commit -m ${JSON.stringify(message)}`,
      { cwd },
      (_err, stdout, stderr) => {
        resolve((stdout + stderr).trim() || "(no output)");
      },
    );
  });
}

export const def = {
  name: "git_commit",
  description:
    "Stage files and create a git commit. Stages all changes if no files specified.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Commit message" },
      cwd: { type: "string", description: "Repository root (optional)" },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Specific files to stage (optional — omit to stage all changes)",
      },
    },
    required: ["message"],
  },
};
