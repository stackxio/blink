import { exec } from "node:child_process";

/** Show or remove untracked files from the git working tree. */

export async function git_clean(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const dryRun = input["dry_run"] !== false; // safe default: dry run
  const directories = input["directories"] === true;
  const ignored = input["ignored"] === true;

  const flags = [
    dryRun ? "-n" : "-f",
    directories ? "-d" : "",
    ignored ? "-x" : "",
  ].filter(Boolean).join("");

  return new Promise((resolve) => {
    const cmd = `git clean ${flags}`;
    exec(cmd, { cwd: root, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const out = stdout?.trim() || stderr?.trim();
      if (!out && err) {
        resolve(`Git clean error: ${String(err)}`);
        return;
      }
      if (!out) {
        resolve(dryRun ? "Nothing to clean — working tree is already clean." : "Cleaned successfully.");
        return;
      }
      const prefix = dryRun ? "Dry run — would remove:\n" : "Removed:\n";
      resolve(`${prefix}${out}`);
    });
  });
}

export const def = {
  name: "git_clean",
  description:
    "Show or remove untracked files from the git working tree. Defaults to dry-run mode so you can preview what would be deleted. Optionally include untracked directories and/or gitignored files.",
  parameters: {
    type: "object",
    properties: {
      dry_run: {
        type: "boolean",
        description: "Only show what would be removed without actually deleting (default: true)",
      },
      directories: {
        type: "boolean",
        description: "Also remove untracked directories (default: false)",
      },
      ignored: {
        type: "boolean",
        description: "Also remove gitignored files (default: false)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
