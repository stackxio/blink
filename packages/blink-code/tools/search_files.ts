import { exec } from "node:child_process";

export async function search_files(input: Record<string, unknown>): Promise<string> {
  const root = input["root"] as string;
  const pattern = input["pattern"] as string;
  return new Promise((resolve) => {
    exec(
      `grep -r -n -- ${JSON.stringify(pattern)} ${JSON.stringify(root)}`,
      { maxBuffer: 10 * 1024 * 1024 },
      (_err, stdout) => {
        const result = stdout.trim();
        resolve(result ? result.slice(0, 5_000) : "No matches found");
      },
    );
  });
}

export const def = {
  name: "search_files",
  description: "Search for a text pattern across files in a directory (grep-style).",
  parameters: {
    type: "object",
    properties: {
      root: { type: "string", description: "Root directory to search" },
      pattern: { type: "string", description: "Text or regex pattern to search for" },
    },
    required: ["root", "pattern"],
  },
};
