import { exec } from "node:child_process";

export async function run_command(input: Record<string, unknown>): Promise<string> {
  const cmd = input["command"] as string;
  const cwd = input["cwd"] as string | undefined;
  return new Promise((resolve) => {
    exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (_err, stdout, stderr) => {
      let result = "";
      if (stdout.trim()) result += stdout.trim();
      if (stderr.trim()) result += (result ? "\nstderr: " : "stderr: ") + stderr.trim();
      if (!result) result = "(no output)";
      if (result.length > 10_000) result = result.slice(0, 10_000) + "\n...[truncated]";
      resolve(result);
    });
  });
}

export const def = {
  name: "run_command",
  description: "Run a shell command and return its stdout/stderr output.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" },
      cwd: { type: "string", description: "Working directory (optional)" },
    },
    required: ["command"],
  },
};
