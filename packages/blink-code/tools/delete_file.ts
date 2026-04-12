import * as fs from "node:fs/promises";

export async function delete_file(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  await fs.unlink(filePath);
  return `Deleted: ${filePath}`;
}

export const def = {
  name: "delete_file",
  description: "Delete a file. Cannot delete directories.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file to delete" },
    },
    required: ["path"],
  },
};
