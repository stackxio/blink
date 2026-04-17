import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function list_npm_scripts(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();

  let pkg: Record<string, unknown>;
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf-8");
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return `No package.json found in ${root}`;
  }

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts || Object.keys(scripts).length === 0) {
    return "No scripts defined in package.json";
  }

  const name = typeof pkg.name === "string" ? pkg.name : path.basename(root);
  const lines = [`Package: ${name}`, `Scripts:`];
  for (const [key, cmd] of Object.entries(scripts)) {
    lines.push(`  ${key}: ${cmd}`);
  }
  return lines.join("\n");
}

export const def = {
  name: "list_npm_scripts",
  description:
    "List all scripts defined in the project's package.json. Useful for discovering available commands like build, dev, test, lint, etc.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory containing package.json (default: current workspace)",
      },
    },
    required: [],
  },
};
