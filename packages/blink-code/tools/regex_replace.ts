import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Find and replace a regex pattern across files (preview by default). */

export async function regex_replace(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const pattern = input["pattern"] as string;
  const replacement = (input["replacement"] as string) ?? "";
  const filePattern = (input["files"] as string) || "*.ts *.tsx *.js *.jsx";
  const flags = (input["flags"] as string) || "g";
  const apply = input["apply"] === true;
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  if (!pattern) return "Error: pattern is required.";

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (e) {
    return `Invalid regex: ${String(e)}`;
  }

  return new Promise((resolve_fn) => {
    exec(
      `git ls-files ${filePattern} 2>/dev/null | head -500`,
      { cwd: absRoot, maxBuffer: 2 * 1024 * 1024 },
      async (_, stdout) => {
        const files = stdout.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          resolve_fn("No files matched the pattern.");
          return;
        }

        const changes: { file: string; matches: number }[] = [];
        let totalMatches = 0;

        for (const file of files) {
          const absFile = resolve(absRoot, file);
          try {
            const content = await readFile(absFile, "utf8");
            const matches = content.match(regex);
            if (!matches || matches.length === 0) continue;
            changes.push({ file, matches: matches.length });
            totalMatches += matches.length;

            if (apply) {
              const newContent = content.replace(regex, replacement);
              await writeFile(absFile, newContent, "utf8");
            }
          } catch { /* skip unreadable */ }
        }

        if (changes.length === 0) return resolve_fn("No matches found.");

        const action = apply ? "Replaced" : "Would replace";
        const lines = [
          `${action} ${totalMatches} match(es) across ${changes.length} file(s):`,
          "",
          ...changes.slice(0, 50).map((c) => `  ${c.file} — ${c.matches} match(es)`),
        ];
        if (changes.length > 50) lines.push(`  ... and ${changes.length - 50} more`);
        if (!apply) lines.push("", "Pass `apply: true` to perform the replacement.");
        resolve_fn(lines.join("\n"));
      },
    );
  });
}

export const def = {
  name: "regex_replace",
  description:
    "Find and replace a regex pattern across tracked files. Defaults to a dry-run preview; pass apply:true to actually rewrite files. Operates only on git-tracked files.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "JavaScript regex pattern (without slashes)",
      },
      replacement: {
        type: "string",
        description: "Replacement string (supports $1, $2 backrefs)",
      },
      files: {
        type: "string",
        description: "Space-separated git pathspecs (default: '*.ts *.tsx *.js *.jsx')",
      },
      flags: {
        type: "string",
        description: "Regex flags (default: 'g')",
      },
      apply: {
        type: "boolean",
        description: "Actually write changes (default: false = dry run)",
      },
      root: {
        type: "string",
        description: "Root directory (default: current workspace)",
      },
    },
    required: ["pattern"],
  },
};
