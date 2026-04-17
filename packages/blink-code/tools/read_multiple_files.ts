import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_CHARS_PER_FILE = 20_000;
const MAX_TOTAL_CHARS = 80_000;

export async function read_multiple_files(input: Record<string, unknown>): Promise<string> {
  const paths = input["paths"] as string[];
  const root = (input["root"] as string) || process.cwd();

  if (!Array.isArray(paths) || paths.length === 0) {
    return "Error: paths must be a non-empty array of file paths.";
  }

  const results: string[] = [];
  let totalChars = 0;

  for (const p of paths) {
    const absPath = p.startsWith("/") ? p : resolve(root, p);
    try {
      let content = await readFile(absPath, "utf8");
      if (content.length > MAX_CHARS_PER_FILE) {
        content = content.slice(0, MAX_CHARS_PER_FILE) + `\n... [truncated at ${MAX_CHARS_PER_FILE} chars]`;
      }
      totalChars += content.length;
      results.push(`=== ${p} ===\n${content}`);
      if (totalChars >= MAX_TOTAL_CHARS) {
        results.push("... [total output limit reached, remaining files skipped]");
        break;
      }
    } catch (err) {
      results.push(`=== ${p} ===\nError reading file: ${String(err)}`);
    }
  }

  return results.join("\n\n");
}

export const def = {
  name: "read_multiple_files",
  description:
    "Read the contents of multiple files in a single call. Returns each file's content with a header. Efficient for reading related files together (e.g., component + its types + its tests).",
  parameters: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Array of file paths to read (absolute or relative to root)",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["paths"],
  },
};
