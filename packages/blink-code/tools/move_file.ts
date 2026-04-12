import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function move_file(input: Record<string, unknown>): Promise<string> {
  const source = input["source"] as string;
  const dest = input["destination"] as string;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(source, dest);
  return `Moved ${source} → ${dest}`;
}

export const def = {
  name: "move_file",
  description: "Move or rename a file.",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Absolute path of the file to move" },
      destination: { type: "string", description: "Absolute destination path" },
    },
    required: ["source", "destination"],
  },
};
