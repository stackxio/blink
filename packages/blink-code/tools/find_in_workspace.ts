import { exec } from "node:child_process";
import { indexer } from "../services/workspace-indexer";

export async function find_in_workspace(input: Record<string, unknown>): Promise<string> {
  const query = input["query"] as string;
  const limit = typeof input["limit"] === "number" ? input["limit"] : 50;

  if (indexer.isReady()) {
    const results = indexer.search(query, limit);
    return results.length > 0 ? results.join("\n") : "No files found";
  }

  // Indexer not ready — fall back to a quick find
  const root = indexer.getRoot() || process.cwd();
  const excludes = ["node_modules", ".git", "dist", "target", ".next", "build", "out"]
    .map((d) => `-not -path '*/${d}/*'`)
    .join(" ");

  return new Promise((resolve) => {
    exec(
      `find . -type f ${excludes} -iname ${JSON.stringify(`*${query}*`)}`,
      { cwd: root, maxBuffer: 10 * 1024 * 1024 },
      (_err, stdout) => {
        const lines = stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .slice(0, limit);
        resolve(lines.length > 0 ? lines.join("\n") : "No files found");
      },
    );
  });
}

export const def = {
  name: "find_in_workspace",
  description:
    "Fast path-based file search across the workspace. Searches file names and relative paths for the given query string (case-insensitive substring match). Uses an in-memory index when ready, otherwise falls back to find. This is a path search — for searching file contents use search_files instead.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Substring to match against file names and relative paths",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 50)",
      },
    },
    required: ["query"],
  },
};
