import { exec } from "node:child_process";

export async function find_todos(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const tags = (input["tags"] as string[]) ?? ["TODO", "FIXME", "HACK", "NOTE", "BUG", "XXX"];
  const limit = typeof input["limit"] === "number" ? input["limit"] : 50;

  const pattern = tags.join("|");

  return new Promise((resolve) => {
    const rgCmd = `rg -n --no-heading -i "(${pattern}):" ${JSON.stringify(root)}`;
    exec(rgCmd, { maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (stdout && stdout.trim()) {
        const lines = stdout.trim().split("\n").slice(0, limit);
        const counts: Record<string, number> = {};
        for (const line of lines) {
          for (const tag of tags) {
            if (line.toUpperCase().includes(`${tag}:`)) {
              counts[tag] = (counts[tag] ?? 0) + 1;
            }
          }
        }
        const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ");
        resolve(`Found ${lines.length} items (${summary}):\n\n${lines.join("\n")}`);
        return;
      }
      // Fallback to grep
      const grepCmd = `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.rs" --include="*.go" -E "(${pattern}):" ${JSON.stringify(root)}`;
      exec(grepCmd, { maxBuffer: 5 * 1024 * 1024 }, (_e2, stdout2) => {
        const lines = (stdout2 || "").trim().split("\n").filter(Boolean).slice(0, limit);
        resolve(lines.length > 0 ? lines.join("\n") : "No TODOs/FIXMEs found.");
      });
    });
  });
}

export const def = {
  name: "find_todos",
  description:
    "Find all TODO, FIXME, HACK, BUG, and NOTE comments in the codebase. Returns file locations and the comment text.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory to search (default: current workspace)",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Comment tags to search for (default: [TODO, FIXME, HACK, NOTE, BUG, XXX])",
      },
      limit: {
        type: "number",
        description: "Maximum results to return (default: 50)",
      },
    },
    required: [],
  },
};
