import { exec } from "node:child_process";
import { resolve } from "node:path";

/** Find large files in a directory that exceed a size threshold. */

export async function find_large_files(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const minSizeMB = typeof input["min_size_mb"] === "number" ? input["min_size_mb"] : 1;
  const limit = typeof input["limit"] === "number" ? input["limit"] : 20;
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  const minSizeBytes = Math.floor(minSizeMB * 1024 * 1024);

  return new Promise((resolve_fn) => {
    // Try git ls-files first for accurate workspace files
    exec(
      `git ls-files -z 2>/dev/null | xargs -0 ls -la 2>/dev/null || find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/target/*' -ls 2>/dev/null`,
      { cwd: absRoot, maxBuffer: 20 * 1024 * 1024, shell: "/bin/sh", timeout: 30_000 },
      (_, stdout) => {
        if (!stdout.trim()) {
          // Fallback: use find with size filter
          exec(
            `find . -type f -size +${minSizeBytes}c -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/target/*' | xargs ls -la 2>/dev/null | sort -k5 -n -r | head -${limit}`,
            { cwd: absRoot, maxBuffer: 5 * 1024 * 1024, shell: "/bin/sh", timeout: 30_000 },
            (__, stdout2, stderr2) => {
              if (!stdout2.trim()) {
                resolve_fn(`No files larger than ${minSizeMB}MB found (or access error: ${stderr2?.slice(0, 200)})`);
                return;
              }
              resolve_fn(formatOutput(stdout2, minSizeMB, limit, absRoot));
            },
          );
          return;
        }

        resolve_fn(formatOutput(stdout, minSizeMB, limit, absRoot));
      },
    );
  });
}

function formatOutput(raw: string, minSizeMB: number, limit: number, root: string): string {
  interface FileEntry { size: number; path: string; }
  const files: FileEntry[] = [];

  for (const line of raw.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue; // ls -la format needs 9 parts
    const size = parseInt(parts[4], 10);
    const path = parts.slice(8).join(" ");
    if (isNaN(size) || size < minSizeMB * 1024 * 1024) continue;
    files.push({ size, path: path.replace(root + "/", "").replace(/^\.\//, "") });
  }

  if (files.length === 0) {
    return `No files larger than ${minSizeMB}MB found.`;
  }

  files.sort((a, b) => b.size - a.size);
  const topFiles = files.slice(0, limit);

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const formatSize = (bytes: number) =>
    bytes > 1024 * 1024 * 1024
      ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
      : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  const rows = topFiles.map((f) => `  ${formatSize(f.size).padStart(10)}  ${f.path}`);

  return [
    `Files larger than ${minSizeMB}MB (found ${files.length}, showing top ${topFiles.length}):`,
    `Total size: ${formatSize(totalSize)}`,
    "",
    ...rows,
  ].join("\n");
}

export const def = {
  name: "find_large_files",
  description:
    "Find files in the workspace that exceed a size threshold. Useful for identifying large binaries, build artifacts, or assets that shouldn't be committed.",
  parameters: {
    type: "object",
    properties: {
      min_size_mb: {
        type: "number",
        description: "Minimum file size in MB to report (default: 1)",
      },
      limit: {
        type: "number",
        description: "Maximum number of files to return (default: 20)",
      },
      root: {
        type: "string",
        description: "Root directory to search (default: current workspace)",
      },
    },
    required: [],
  },
};
