import { exec } from "node:child_process";
import * as fs from "node:fs/promises";

// Extract a high-level outline (functions, classes, exports) from a file
async function outlineFile(filePath: string): Promise<string> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    return `Cannot read file: ${String(err)}`;
  }

  const lines = content.split("\n");
  const outline: Array<{ line: number; text: string }> = [];

  const patterns: RegExp[] = [
    // JS/TS exports, functions, classes, interfaces, types, enums
    /^export\s+(default\s+)?(async\s+)?function\s+\w+/,
    /^export\s+(default\s+)?(abstract\s+)?class\s+\w+/,
    /^export\s+(type|interface|enum)\s+\w+/,
    /^export\s+const\s+\w+\s*=/,
    /^(async\s+)?function\s+\w+/,
    /^class\s+\w+/,
    // Python
    /^(async\s+)?def\s+\w+/,
    /^class\s+\w+/,
    // Rust
    /^(pub\s+)?(async\s+)?fn\s+\w+/,
    /^(pub\s+)?(struct|enum|trait|impl)\s+\w+/,
    // Go
    /^func\s+/,
    /^type\s+\w+/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (patterns.some((p) => p.test(trimmed))) {
      // Grab just the first line, up to 100 chars
      const text = lines[i].trim().slice(0, 100);
      outline.push({ line: i + 1, text });
    }
  }

  if (outline.length === 0) return `No recognizable symbols found in ${filePath}`;

  return [`Outline of ${filePath}:`, ...outline.map((o) => `  L${o.line}: ${o.text}`)].join("\n");
}

export async function get_file_outline(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  return outlineFile(filePath);
}

export const def = {
  name: "get_file_outline",
  description:
    "Get a high-level outline of a source file — lists functions, classes, exports, and type definitions with line numbers. Useful for quickly understanding a file's structure without reading the whole thing.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the file to outline",
      },
    },
    required: ["path"],
  },
};
