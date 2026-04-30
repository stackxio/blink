import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** High-level overview of a repository: language mix, key files, recent activity. */

export async function repo_overview(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  const sections: string[] = [];

  // Section 1: package.json or Cargo.toml
  try {
    const pkg = JSON.parse(await readFile(resolve(absRoot, "package.json"), "utf8"));
    const deps = Object.keys(pkg.dependencies ?? {}).length;
    const devDeps = Object.keys(pkg.devDependencies ?? {}).length;
    sections.push(`# package.json
Name: ${pkg.name ?? "?"}
Version: ${pkg.version ?? "?"}
Dependencies: ${deps} prod, ${devDeps} dev
Scripts: ${Object.keys(pkg.scripts ?? {}).join(", ") || "(none)"}`);
  } catch {}

  try {
    const cargoToml = await readFile(resolve(absRoot, "Cargo.toml"), "utf8");
    const nameM = cargoToml.match(/^name\s*=\s*"([^"]+)"/m);
    const verM = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
    sections.push(`# Cargo.toml
Name: ${nameM?.[1] ?? "?"}
Version: ${verM?.[1] ?? "?"}`);
  } catch {}

  // Section 2: language breakdown
  const langStats = await new Promise<string>((resolve_fn) => {
    exec(
      `git ls-files 2>/dev/null | awk -F. '{ext=$NF} {count[ext]++} END {for (e in count) print count[e], e}' | sort -rn | head -10`,
      { cwd: absRoot, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh" },
      (_, stdout) => resolve_fn(stdout?.trim() || ""),
    );
  });
  if (langStats) sections.push(`# Top file extensions\n${langStats}`);

  // Section 3: recent commits
  const commits = await new Promise<string>((resolve_fn) => {
    exec(
      `git log --oneline -10 2>/dev/null`,
      { cwd: absRoot, maxBuffer: 1024 * 1024 },
      (_, stdout) => resolve_fn(stdout?.trim() || ""),
    );
  });
  if (commits) sections.push(`# Recent commits\n${commits}`);

  // Section 4: branches
  const branches = await new Promise<string>((resolve_fn) => {
    exec(
      `git branch -a 2>/dev/null | head -20`,
      { cwd: absRoot, maxBuffer: 1024 * 1024, shell: "/bin/sh" },
      (_, stdout) => resolve_fn(stdout?.trim() || ""),
    );
  });
  if (branches) sections.push(`# Branches\n${branches}`);

  // Section 5: key files
  const keyFiles = await new Promise<string>((resolve_fn) => {
    exec(
      `ls -1 2>/dev/null | head -30`,
      { cwd: absRoot, maxBuffer: 1024 * 1024, shell: "/bin/sh" },
      (_, stdout) => resolve_fn(stdout?.trim() || ""),
    );
  });
  if (keyFiles) sections.push(`# Top-level entries\n${keyFiles}`);

  return sections.join("\n\n").slice(0, 8000);
}

export const def = {
  name: "repo_overview",
  description:
    "High-level overview of a repository: package metadata, language file mix, recent commits, branches, and top-level structure. Useful as a first orientation pass.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the repo (default: current workspace)",
      },
    },
    required: [],
  },
};
