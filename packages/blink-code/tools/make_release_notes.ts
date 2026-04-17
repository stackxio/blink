import { exec } from "node:child_process";

/** Generate release notes from git commits between two tags/refs. */

export async function make_release_notes(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const from = input["from"] as string | undefined; // tag or commit
  const to = (input["to"] as string) || "HEAD";
  const title = (input["title"] as string) || "Release Notes";
  const format = (input["format"] as string) || "markdown";

  return new Promise((resolve) => {
    // Get latest tag if from not specified
    const getFrom = from
      ? Promise.resolve(from)
      : new Promise<string>((res) => {
          exec("git describe --tags --abbrev=0 HEAD^ 2>/dev/null || git rev-list --max-parents=0 HEAD", {
            cwd: root, shell: "/bin/sh",
          }, (_, stdout) => res(stdout.trim() || "HEAD~10"));
        });

    getFrom.then((fromRef) => {
      const logCmd = `git log --oneline --no-merges ${fromRef}..${to} 2>&1`;

      exec(logCmd, { cwd: root, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        if (err && !stdout) {
          resolve(`Git error: ${String(err)}`);
          return;
        }

        const commits = stdout.trim().split("\n").filter(Boolean);
        if (commits.length === 0) {
          resolve(`No commits found between ${fromRef} and ${to}.`);
          return;
        }

        // Categorize by conventional commit prefixes
        const categories: Record<string, string[]> = {
          "Features": [],
          "Bug Fixes": [],
          "Performance": [],
          "Documentation": [],
          "Refactoring": [],
          "Tests": [],
          "Chores": [],
          "Other": [],
        };

        for (const line of commits) {
          const m = line.match(/^([a-f0-9]+)\s+(.+)$/);
          if (!m) continue;
          const [, hash, msg] = m;
          const entry = format === "markdown" ? `- ${msg} (\`${hash}\`)` : `  [${hash}] ${msg}`;

          if (/^feat(\(.+\))?[!:]/.test(msg)) categories["Features"].push(entry);
          else if (/^fix(\(.+\))?[!:]/.test(msg)) categories["Bug Fixes"].push(entry);
          else if (/^perf(\(.+\))?[!:]/.test(msg)) categories["Performance"].push(entry);
          else if (/^docs?(\(.+\))?[!:]/.test(msg)) categories["Documentation"].push(entry);
          else if (/^refactor(\(.+\))?[!:]/.test(msg)) categories["Refactoring"].push(entry);
          else if (/^tests?(\(.+\))?[!:]/.test(msg)) categories["Tests"].push(entry);
          else if (/^chore(\(.+\))?[!:]/.test(msg)) categories["Chores"].push(entry);
          else categories["Other"].push(entry);
        }

        const lines: string[] = [];

        if (format === "markdown") {
          lines.push(`# ${title}`);
          lines.push(`\n*${commits.length} commit(s) from \`${fromRef}\` to \`${to}\`*\n`);
          for (const [cat, items] of Object.entries(categories)) {
            if (items.length === 0) continue;
            lines.push(`## ${cat}\n`);
            lines.push(items.join("\n"), "");
          }
        } else {
          lines.push(`${title}`);
          lines.push(`${"=".repeat(title.length)}`);
          lines.push(`${commits.length} commit(s) from ${fromRef} to ${to}\n`);
          for (const [cat, items] of Object.entries(categories)) {
            if (items.length === 0) continue;
            lines.push(`${cat}:`);
            lines.push(items.join("\n"), "");
          }
        }

        resolve(lines.join("\n"));
      });
    });
  });
}

export const def = {
  name: "make_release_notes",
  description:
    "Generate release notes from git commits between two tags/refs. Automatically categorizes commits using Conventional Commits prefixes (feat, fix, perf, docs, refactor, etc.). Outputs Markdown or plain text.",
  parameters: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "Starting tag or commit (default: previous tag)",
      },
      to: {
        type: "string",
        description: "Ending tag or commit (default: HEAD)",
      },
      title: {
        type: "string",
        description: "Release title (default: 'Release Notes')",
      },
      format: {
        type: "string",
        enum: ["markdown", "plain"],
        description: "Output format: markdown (default) or plain text",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
    },
    required: [],
  },
};
