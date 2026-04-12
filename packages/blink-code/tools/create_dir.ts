import * as fs from "node:fs/promises";

export async function create_dir(input: Record<string, unknown>): Promise<string> {
  const dirPath = input["path"] as string;
  await fs.mkdir(dirPath, { recursive: true });
  return `Created directory: ${dirPath}`;
}

export const def = {
  name: "create_dir",
  description: "Create a directory (and any missing parent directories).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the directory to create" },
    },
    required: ["path"],
  },
};
