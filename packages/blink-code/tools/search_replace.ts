import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Search and replace text in a file (literal or regex). */

export async function search_replace(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const search = input["search"] as string;
  const replacement = (input["replacement"] as string) ?? "";
  const useRegex = input["regex"] === true;
  const flags = (input["flags"] as string) || "g";
  const dryRun = input["dry_run"] === true;
  const root = (input["root"] as string) || process.cwd();

  if (!filePath) return "Error: path is required.";
  if (!search) return "Error: search is required.";

  const absPath = filePath.startsWith("/") ? filePath : resolve(root, filePath);

  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (e) {
    return `Error reading file: ${String(e)}`;
  }

  let count = 0;
  let newContent: string;

  if (useRegex) {
    let re: RegExp;
    try {
      re = new RegExp(search, flags.includes("g") ? flags : flags + "g");
    } catch (e) {
      return `Invalid regex: ${String(e)}`;
    }
    newContent = content.replace(re, () => { count++; return replacement; });
  } else {
    // Literal search with global replace
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    newContent = content.replace(new RegExp(escaped, "g"), () => { count++; return replacement; });
  }

  if (count === 0) {
    return `No matches found for ${useRegex ? `regex /${search}/${flags}` : `"${search}"`} in ${filePath}`;
  }

  if (dryRun) {
    return `Dry run: would replace ${count} occurrence(s) of ${useRegex ? `/${search}/${flags}` : `"${search}"`} with "${replacement}" in ${filePath}`;
  }

  try {
    await writeFile(absPath, newContent, "utf8");
  } catch (e) {
    return `Error writing file: ${String(e)}`;
  }

  return `Replaced ${count} occurrence(s) of ${useRegex ? `/${search}/${flags}` : `"${search}"`} with "${replacement}" in ${filePath}`;
}

export const def = {
  name: "search_replace",
  description:
    "Search and replace text in a file. Supports literal string search or regular expressions. Can do a dry-run to preview changes without modifying the file.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path to modify (absolute or relative to root)",
      },
      search: {
        type: "string",
        description: "Text or regex pattern to search for",
      },
      replacement: {
        type: "string",
        description: "Text to replace matches with (default: empty string = delete)",
      },
      regex: {
        type: "boolean",
        description: "If true, treat search as a regular expression (default: false = literal)",
      },
      flags: {
        type: "string",
        description: "Regex flags when regex=true: i (case-insensitive), m (multiline). 'g' is always added.",
      },
      dry_run: {
        type: "boolean",
        description: "If true, report what would be changed without modifying the file (default: false)",
      },
      root: {
        type: "string",
        description: "Root directory for relative paths (default: current workspace)",
      },
    },
    required: ["path", "search"],
  },
};
