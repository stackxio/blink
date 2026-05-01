import { exec } from "node:child_process";
import { resolve } from "node:path";

/** List the contents of an archive (zip, tar, tar.gz) without extracting it. */

export async function extract_archive(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const path = input["path"] as string;
  if (!path) return "Error: path is required.";

  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);
  const absPath = path.startsWith("/") ? path : resolve(absRoot, path);

  let cmd: string;
  if (/\.zip$/i.test(path)) {
    cmd = `unzip -l "${absPath}" 2>&1 | head -100`;
  } else if (/\.tar\.gz$|\.tgz$/i.test(path)) {
    cmd = `tar -tzf "${absPath}" 2>&1 | head -100`;
  } else if (/\.tar\.bz2$|\.tbz2$/i.test(path)) {
    cmd = `tar -tjf "${absPath}" 2>&1 | head -100`;
  } else if (/\.tar$/i.test(path)) {
    cmd = `tar -tf "${absPath}" 2>&1 | head -100`;
  } else if (/\.gz$/i.test(path)) {
    cmd = `gunzip -l "${absPath}" 2>&1`;
  } else {
    return `Unsupported archive format: ${path}. Supported: .zip, .tar, .tar.gz, .tgz, .tar.bz2, .tbz2, .gz`;
  }

  return new Promise((resolve_fn) => {
    exec(cmd, { cwd: absRoot, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve_fn(`No content. Error: ${String(err)}`);
        return;
      }
      resolve_fn(`Contents of ${path}:\n\n${out}`);
    });
  });
}

export const def = {
  name: "extract_archive",
  description:
    "List the contents of an archive file (zip, tar, tar.gz, tar.bz2, gz) without extracting it. Useful to inspect what an archive contains.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the archive file",
      },
      root: {
        type: "string",
        description: "Root directory (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
