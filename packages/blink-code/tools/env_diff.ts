import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Compare two .env files and show what's added, removed, or changed. */

function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    map.set(key, val);
  }
  return map;
}

const SENSITIVE = /key|secret|password|token|auth|credential|private|api/i;

function redact(key: string, value: string): string {
  return SENSITIVE.test(key) ? "****" : value;
}

export async function env_diff(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const file1 = (input["file1"] as string) || ".env.example";
  const file2 = (input["file2"] as string) || ".env";

  const abs1 = file1.startsWith("/") ? file1 : resolve(root, file1);
  const abs2 = file2.startsWith("/") ? file2 : resolve(root, file2);

  let content1 = "", content2 = "";
  try { content1 = await readFile(abs1, "utf8"); } catch (e) { return `Cannot read ${file1}: ${String(e)}`; }
  try { content2 = await readFile(abs2, "utf8"); } catch (e) { return `Cannot read ${file2}: ${String(e)}`; }

  const map1 = parseEnv(content1);
  const map2 = parseEnv(content2);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const same: string[] = [];

  for (const [k, v] of map2) {
    if (!map1.has(k)) {
      added.push(`  + ${k}=${redact(k, v)}`);
    } else if (map1.get(k) !== v) {
      changed.push(`  ~ ${k}: ${redact(k, map1.get(k)!)} → ${redact(k, v)}`);
    } else {
      same.push(k);
    }
  }

  for (const [k, v] of map1) {
    if (!map2.has(k)) {
      removed.push(`  - ${k}=${redact(k, v)}`);
    }
  }

  const lines = [`Comparing ${file1} (${map1.size} keys) vs ${file2} (${map2.size} keys):`];

  if (added.length > 0) lines.push(`\nAdded in ${file2} (${added.length}):\n${added.join("\n")}`);
  if (removed.length > 0) lines.push(`\nMissing from ${file2} (${removed.length}):\n${removed.join("\n")}`);
  if (changed.length > 0) lines.push(`\nChanged values (${changed.length}):\n${changed.join("\n")}`);
  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    lines.push("\n✅ Both files have the same keys and values.");
  } else {
    lines.push(`\nUnchanged: ${same.length} keys`);
  }

  return lines.join("\n");
}

export const def = {
  name: "env_diff",
  description:
    "Compare two .env files (e.g. .env.example vs .env) to find added, removed, or changed environment variables. Sensitive values (keys, tokens, passwords) are redacted.",
  parameters: {
    type: "object",
    properties: {
      file1: {
        type: "string",
        description: "First .env file to compare (default: .env.example)",
      },
      file2: {
        type: "string",
        description: "Second .env file to compare against (default: .env)",
      },
      root: {
        type: "string",
        description: "Root directory for relative paths (default: current workspace)",
      },
    },
    required: [],
  },
};
