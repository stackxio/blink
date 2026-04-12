import * as fs from "node:fs/promises";

export async function read_file(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const offset = input["offset"] != null ? Number(input["offset"]) : null;
  const limit = input["limit"] != null ? Number(input["limit"]) : null;
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;

  if (offset != null || limit != null) {
    const start = Math.max(0, (offset ?? 1) - 1); // 1-based → 0-based
    const end = limit != null ? Math.min(start + limit, totalLines) : totalLines;
    const slice = lines.slice(start, end).join("\n");
    return `[Lines ${start + 1}–${end} of ${totalLines}]\n` + slice;
  }

  if (content.length > 50_000) {
    return `${content.slice(0, 50_000)}\n\n[File truncated — ${content.length} bytes total, showing first 50000 chars. Use offset/limit to read specific line ranges.]`;
  }
  return content;
}

export const def = {
  name: "read_file",
  description:
    "Read file contents. Use offset and limit to read specific line ranges of large files.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file" },
      offset: { type: "number", description: "1-based line number to start reading from (optional)" },
      limit: { type: "number", description: "Number of lines to read (optional)" },
    },
    required: ["path"],
  },
};
