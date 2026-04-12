import { exec } from "node:child_process";

export async function glob_files(input: Record<string, unknown>): Promise<string> {
  const root = input["root"] as string;
  const pattern = input["pattern"] as string;
  return new Promise((resolve) => {
    exec(
      `find ${JSON.stringify(root)} -name ${JSON.stringify(pattern)} -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/target/*"`,
      { maxBuffer: 5 * 1024 * 1024 },
      (_err, stdout) => {
        resolve(stdout.trim() || "No files found matching pattern");
      },
    );
  });
}

export const def = {
  name: "glob_files",
  description:
    "Find files matching a glob pattern (e.g. '*.ts', 'src/**/*.tsx'). Skips node_modules, .git, dist, target.",
  parameters: {
    type: "object",
    properties: {
      root: { type: "string", description: "Root directory to search from" },
      pattern: { type: "string", description: "Filename pattern (e.g. '*.ts', 'index.*')" },
    },
    required: ["root", "pattern"],
  },
};
