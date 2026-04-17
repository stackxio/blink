import { exec } from "node:child_process";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** Find duplicate files in a directory by comparing file hashes. */

export async function find_duplicates(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);
  const maxFiles = typeof input["max_files"] === "number" ? input["max_files"] : 500;
  const pattern = (input["pattern"] as string) || "*";

  return new Promise((resolve_fn) => {
    const cmd = pattern === "*"
      ? `git ls-files 2>/dev/null || find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/target/*'`
      : `git ls-files '${pattern}' 2>/dev/null || find . -name '${pattern}' -type f -not -path '*/.git/*'`;

    exec(cmd, { cwd: absRoot, maxBuffer: 10 * 1024 * 1024 }, async (_, stdout) => {
      const files = stdout.trim().split("\n").filter(Boolean).slice(0, maxFiles);

      if (files.length === 0) {
        resolve_fn("No files found.");
        return;
      }

      const hashMap = new Map<string, string[]>();

      await Promise.all(
        files.map(async (f) => {
          const absPath = f.startsWith("/") ? f : resolve(absRoot, f);
          try {
            const content = await readFile(absPath);
            const h = createHash("md5").update(content).digest("hex");
            const existing = hashMap.get(h) ?? [];
            existing.push(f);
            hashMap.set(h, existing);
          } catch {
            // skip unreadable files
          }
        }),
      );

      const duplicates: string[] = [];
      for (const [hash, paths] of hashMap) {
        if (paths.length > 1) {
          duplicates.push(`[MD5: ${hash}]\n${paths.map((p) => `  ${p}`).join("\n")}`);
        }
      }

      if (duplicates.length === 0) {
        resolve_fn(`No duplicate files found among ${files.length} scanned files.`);
        return;
      }

      resolve_fn(
        `Found ${duplicates.length} group(s) of duplicate files (scanned ${files.length} files):\n\n${duplicates.join("\n\n")}`,
      );
    });
  });
}

export const def = {
  name: "find_duplicates",
  description:
    "Find duplicate files in the workspace by comparing MD5 hashes. Groups identical files together. Useful for cleaning up copied or redundant assets.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory to scan (default: current workspace)",
      },
      pattern: {
        type: "string",
        description: "Glob pattern to filter files (default: all files). E.g. '*.ts', '*.png'",
      },
      max_files: {
        type: "number",
        description: "Maximum number of files to scan (default: 500)",
      },
    },
    required: [],
  },
};
