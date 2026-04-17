import { exec } from "node:child_process";

export async function diff_files(input: Record<string, unknown>): Promise<string> {
  const file1 = input["file1"] as string;
  const file2 = input["file2"] as string | undefined;
  const root = (input["root"] as string) || process.cwd();
  const context = typeof input["context"] === "number" ? input["context"] : 5;

  return new Promise((resolve) => {
    let command: string;

    if (file2) {
      // Diff two specific files
      command = `diff -u --label ${JSON.stringify(file1)} --label ${JSON.stringify(file2)} ${JSON.stringify(file1)} ${JSON.stringify(file2)}`;
    } else {
      // Diff file against HEAD using git
      command = `git diff HEAD -U${context} -- ${JSON.stringify(file1)}`;
    }

    exec(
      command,
      { cwd: root, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // diff exits with 1 when there are differences — that's normal
        const isExpectedExit = !file2 || (err?.code === 1);
        if (err && !isExpectedExit && !stdout) {
          // Try git show as fallback
          exec(
            `git show HEAD:${JSON.stringify(file1)}`,
            { cwd: root, maxBuffer: 5 * 1024 * 1024 },
            (_e2, gitout) => {
              resolve(gitout ? `Git tracked version:\n${gitout.slice(0, 6000)}` : `Error: ${stderr || String(err)}`);
            },
          );
          return;
        }

        const out = (stdout || stderr || "No differences found").trim();
        const truncated = out.length > 8000 ? out.slice(0, 8000) + "\n[truncated]" : out;
        resolve(truncated || "No differences found");
      },
    );
  });
}

export const def = {
  name: "diff_files",
  description:
    "Show a diff between two files, or between a file and its last committed version (git diff HEAD). Returns unified diff format.",
  parameters: {
    type: "object",
    properties: {
      file1: {
        type: "string",
        description: "Path to the file to diff (absolute or relative to root). When file2 is omitted, diffs this file against git HEAD.",
      },
      file2: {
        type: "string",
        description: "Optional second file to compare against file1. If omitted, uses git diff HEAD.",
      },
      root: {
        type: "string",
        description: "Working directory for git commands (default: current workspace)",
      },
      context: {
        type: "number",
        description: "Number of context lines around changes (default: 5)",
      },
    },
    required: ["file1"],
  },
};
