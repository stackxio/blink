import { exec } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

/** Apply a patch/diff to a file or the repository. */

export async function patch_apply(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const patch = input["patch"] as string;
  const dryRun = input["dry_run"] === true;
  const reverse = input["reverse"] === true;
  const stripLevel = typeof input["strip"] === "number" ? input["strip"] : 1;

  if (!patch) return "Error: patch content is required.";

  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  // Write patch to temp file
  const tmpFile = join(tmpdir(), `blink-patch-${randomUUID()}.patch`);
  try {
    await writeFile(tmpFile, patch, "utf8");
  } catch (e) {
    return `Error writing temp file: ${String(e)}`;
  }

  const dryFlag = dryRun ? "--dry-run" : "";
  const reverseFlag = reverse ? "-R" : "";
  const cmd = `patch ${dryFlag} ${reverseFlag} -p${stripLevel} < ${JSON.stringify(tmpFile)}`;

  return new Promise((resolve_fn) => {
    exec(cmd, { cwd: absRoot, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh", timeout: 30_000 }, async (err, stdout, stderr) => {
      try { await unlink(tmpFile); } catch { /* ignore */ }

      const out = (stdout + stderr).trim();
      if (!out && err) {
        resolve_fn(`Patch error: ${String(err)}`);
        return;
      }
      const prefix = dryRun ? "[DRY RUN] " : reverse ? "[REVERSED] " : "";
      resolve_fn(`${prefix}${out || "Patch applied successfully."}`);
    });
  });
}

export const def = {
  name: "patch_apply",
  description:
    "Apply a unified diff/patch to the project. Supports dry-run mode to preview changes without applying, reversing a patch, and configuring the strip level for path prefixes.",
  parameters: {
    type: "object",
    properties: {
      patch: {
        type: "string",
        description: "Patch content in unified diff format (output of git diff or diff -u)",
      },
      dry_run: {
        type: "boolean",
        description: "If true, check if the patch would apply without actually applying it (default: false)",
      },
      reverse: {
        type: "boolean",
        description: "If true, reverse/undo the patch (default: false)",
      },
      strip: {
        type: "number",
        description: "Number of leading path components to strip (default: 1 for git patches)",
      },
      root: {
        type: "string",
        description: "Root directory to apply the patch in (default: current workspace)",
      },
    },
    required: ["patch"],
  },
};
