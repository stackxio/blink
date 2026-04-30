import { stat } from "node:fs/promises";
import { resolve } from "node:path";

/** Return size, mtime, and other stats for a file or directory. */

export async function file_stats(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const path = input["path"] as string;
  if (!path) return "Error: path is required.";

  const absPath = path.startsWith("/") ? path : resolve(root, path);

  try {
    const s = await stat(absPath);
    const kind = s.isDirectory() ? "directory" : s.isFile() ? "file" : s.isSymbolicLink() ? "symlink" : "other";
    const sizeKb = (s.size / 1024).toFixed(2);
    const sizeMb = (s.size / 1024 / 1024).toFixed(2);
    const sizeStr = s.size < 1024
      ? `${s.size} bytes`
      : s.size < 1024 * 1024
        ? `${sizeKb} KB`
        : `${sizeMb} MB`;
    return [
      `Path:     ${absPath}`,
      `Type:     ${kind}`,
      `Size:     ${sizeStr} (${s.size} bytes)`,
      `Mode:     ${(s.mode & 0o777).toString(8)}`,
      `Created:  ${s.birthtime.toISOString()}`,
      `Modified: ${s.mtime.toISOString()}`,
      `Accessed: ${s.atime.toISOString()}`,
    ].join("\n");
  } catch (e) {
    return `Error: ${String(e)}`;
  }
}

export const def = {
  name: "file_stats",
  description:
    "Get detailed file system stats for a path (size, mtime, atime, mode, type). Works for files, directories, and symlinks.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to inspect (relative to root, or absolute)",
      },
      root: {
        type: "string",
        description: "Root directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
