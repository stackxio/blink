import { exec } from "node:child_process";

export async function git_blame(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const root = (input["root"] as string) || process.cwd();
  const lineStart = input["line_start"] as number | undefined;
  const lineEnd = input["line_end"] as number | undefined;

  const lineFlag =
    lineStart != null && lineEnd != null ? `-L ${lineStart},${lineEnd}` : "";

  return new Promise((resolve) => {
    exec(
      `git blame --line-porcelain ${lineFlag} -- ${JSON.stringify(filePath)}`,
      { cwd: root, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          resolve(`Git blame error: ${stderr || String(err)}`);
          return;
        }
        // Parse porcelain output into readable lines
        const lines: string[] = [];
        const blocks = stdout.split(/(?=^[0-9a-f]{40} )/m);
        for (const block of blocks) {
          if (!block.trim()) continue;
          const blockLines = block.split("\n");
          const header = blockLines[0];
          const hashMatch = header.match(/^([0-9a-f]{40}) \d+ (\d+)/);
          if (!hashMatch) continue;
          const hash = hashMatch[1].slice(0, 8);
          const lineNum = hashMatch[2];
          let author = "";
          let time = "";
          let summary = "";
          for (const l of blockLines) {
            if (l.startsWith("author ")) author = l.slice(7);
            if (l.startsWith("author-time ")) {
              const ts = parseInt(l.slice(12), 10);
              time = new Date(ts * 1000).toISOString().slice(0, 10);
            }
            if (l.startsWith("summary ")) summary = l.slice(8);
          }
          const codeLine = blockLines[blockLines.length - 1].replace(/^\t/, "");
          lines.push(
            `${lineNum.padStart(4)} ${hash} ${time} ${author.slice(0, 16).padEnd(16)} ${summary.slice(0, 30).padEnd(30)} | ${codeLine}`,
          );
        }
        if (lines.length === 0) {
          resolve(`No blame output for: ${filePath}`);
          return;
        }
        resolve(`Git blame for ${filePath}:\n${lines.join("\n")}`);
      },
    );
  });
}

export const def = {
  name: "git_blame",
  description:
    "Show git blame for a file — who last changed each line and in which commit. Optionally limit to a line range.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path to blame (relative to root or absolute)",
      },
      root: {
        type: "string",
        description: "Root directory of the git repo (default: current workspace)",
      },
      line_start: {
        type: "number",
        description: "Start line for partial blame (optional)",
      },
      line_end: {
        type: "number",
        description: "End line for partial blame (optional)",
      },
    },
    required: ["path"],
  },
};
