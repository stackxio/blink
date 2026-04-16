import { exec } from "node:child_process";

export async function search_files(input: Record<string, unknown>): Promise<string> {
  const root = input["root"] as string;
  const pattern = input["pattern"] as string;
  const flags = input["case_sensitive"] === true ? "" : "-i";

  return new Promise((resolve) => {
    // Try ripgrep first (respects .gitignore, much faster)
    exec(
      `rg ${flags} -n --no-heading --max-count 5 -- ${JSON.stringify(pattern)} ${JSON.stringify(root)}`,
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (!err || stdout.trim()) {
          const result = stdout.trim();
          resolve(result ? result.slice(0, 8_000) : "No matches found");
          return;
        }
        // Fallback to grep
        exec(
          `grep -r -n ${flags} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=target -- ${JSON.stringify(pattern)} ${JSON.stringify(root)}`,
          { maxBuffer: 10 * 1024 * 1024 },
          (_err2, stdout2) => {
            const result = stdout2.trim();
            resolve(result ? result.slice(0, 8_000) : "No matches found");
          },
        );
      },
    );
  });
}

export const def = {
  name: "search_files",
  description:
    "Search for a text pattern across files in a directory. Uses ripgrep (respects .gitignore) when available, falls back to grep.",
  parameters: {
    type: "object",
    properties: {
      root: { type: "string", description: "Root directory to search" },
      pattern: { type: "string", description: "Text or regex pattern to search for" },
      case_sensitive: {
        type: "boolean",
        description: "Whether to use case-sensitive matching (default: false)",
      },
    },
    required: ["root", "pattern"],
  },
};
