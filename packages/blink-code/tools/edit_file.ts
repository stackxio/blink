import * as fs from "node:fs/promises";

export async function edit_file(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const oldString = input["old_string"] as string;
  const newString = input["new_string"] as string;
  const content = await fs.readFile(filePath, "utf-8");
  if (!content.includes(oldString)) {
    throw new Error(
      "String not found in file. Make sure old_string matches exactly (including whitespace).",
    );
  }
  const updated = content.replace(oldString, newString);
  await fs.writeFile(filePath, updated, "utf-8");
  return `Edited ${filePath}: replaced ${oldString.length} chars with ${newString.length} chars`;
}

export const def = {
  name: "edit_file",
  description:
    "Surgically replace an exact string in a file. Safer than write_file for small edits. The old_string must match exactly (including whitespace and newlines).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file" },
      old_string: { type: "string", description: "The exact string to replace" },
      new_string: { type: "string", description: "The string to replace it with" },
    },
    required: ["path", "old_string", "new_string"],
  },
};
