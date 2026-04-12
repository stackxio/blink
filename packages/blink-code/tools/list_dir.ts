import * as fs from "node:fs/promises";

export async function list_dir(input: Record<string, unknown>): Promise<string> {
  const dirPath = input["path"] as string;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  if (entries.length === 0) return "(empty directory)";
  return entries
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort()
    .join("\n");
}

export const def = {
  name: "list_dir",
  description: "List files and directories in a directory.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Absolute path to the directory" } },
    required: ["path"],
  },
};
