import { readdir, rename } from "node:fs/promises";
import { resolve, extname, basename, join } from "node:path";

/** Rename multiple files by pattern. */

export async function bulk_rename(input: Record<string, unknown>): Promise<string> {
  const dir = input["dir"] as string;
  const pattern = input["pattern"] as string; // regex pattern to match filename
  const replacement = (input["replacement"] as string) ?? "";
  const dryRun = input["dry_run"] !== false; // default: dry run
  const root = (input["root"] as string) || process.cwd();

  if (!dir) return "Error: dir is required.";
  if (!pattern) return "Error: pattern is required.";

  const absDir = dir.startsWith("/") ? dir : resolve(root, dir);

  let re: RegExp;
  try {
    re = new RegExp(pattern, "g");
  } catch (e) {
    return `Invalid regex: ${String(e)}`;
  }

  let files: string[];
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    files = entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (e) {
    return `Error reading directory: ${String(e)}`;
  }

  const renames: Array<{ from: string; to: string }> = [];

  for (const file of files) {
    const newName = file.replace(re, replacement);
    if (newName !== file) {
      renames.push({ from: file, to: newName });
    }
  }

  if (renames.length === 0) {
    return `No files matched the pattern /${pattern}/ in ${dir}`;
  }

  if (dryRun) {
    const preview = renames.map((r) => `  ${r.from} → ${r.to}`).join("\n");
    return `Dry run — would rename ${renames.length} file(s):\n${preview}\n\nRun with dry_run: false to apply.`;
  }

  const results: string[] = [];
  for (const { from, to } of renames) {
    try {
      await rename(join(absDir, from), join(absDir, to));
      results.push(`  ✓ ${from} → ${to}`);
    } catch (e) {
      results.push(`  ✗ ${from}: ${String(e)}`);
    }
  }

  return `Renamed ${results.filter((r) => r.startsWith("  ✓")).length}/${renames.length} file(s):\n${results.join("\n")}`;
}

export const def = {
  name: "bulk_rename",
  description:
    "Rename multiple files in a directory using a regex pattern and replacement string. Defaults to dry-run mode so you can preview changes before applying.",
  parameters: {
    type: "object",
    properties: {
      dir: {
        type: "string",
        description: "Directory containing files to rename (absolute or relative to root)",
      },
      pattern: {
        type: "string",
        description: "Regex pattern to match in filenames (e.g. '\\.jsx$' to find .jsx files)",
      },
      replacement: {
        type: "string",
        description: "Replacement string (e.g. '.tsx' to rename .jsx → .tsx). Supports regex groups.",
      },
      dry_run: {
        type: "boolean",
        description: "If true (default), only preview changes without renaming. Set false to apply.",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["dir", "pattern"],
  },
};
