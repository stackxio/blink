import { exec } from "node:child_process";

export async function get_git_remotes(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();

  return new Promise((resolve) => {
    exec(`git remote -v`, { cwd: root, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err || !stdout.trim()) {
        resolve(stderr?.trim() ? `Git error: ${stderr.trim()}` : "No git remotes configured.");
        return;
      }
      // Deduplicate (git remote -v shows fetch and push separately)
      const seen = new Set<string>();
      const lines = stdout.trim().split("\n").filter(line => {
        const key = line.split("\t")[0];
        if (seen.has(key + line)) return false;
        seen.add(key + line);
        return true;
      });
      resolve(`Git remotes:\n${lines.join("\n")}`);
    });
  });
}

export const def = {
  name: "get_git_remotes",
  description: "List all configured git remotes and their URLs.",
  parameters: {
    type: "object",
    properties: {
      root: { type: "string", description: "Root directory of the git repo (default: current workspace)" },
    },
    required: [],
  },
};
