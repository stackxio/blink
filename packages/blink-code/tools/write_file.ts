import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function write_file(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const content = input["content"] as string;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
  return `Wrote ${content.length} bytes to ${filePath}`;
}

export const def = {
  name: "write_file",
  description: "Write content to a file, creating it if it does not exist.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
};
