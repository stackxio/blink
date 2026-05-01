/** Convert indentation between tabs and spaces. */

export async function convert_indent(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  const direction = (input["direction"] as string) || "tabs-to-spaces";
  const width = typeof input["width"] === "number" ? input["width"] : 2;

  if (text == null) return "Error: text is required.";

  const lines = text.split("\n");
  const out: string[] = [];

  if (direction === "tabs-to-spaces") {
    const replacement = " ".repeat(width);
    for (const line of lines) {
      const m = line.match(/^(\t+)/);
      if (m) {
        out.push(replacement.repeat(m[1].length) + line.slice(m[1].length));
      } else {
        out.push(line);
      }
    }
  } else if (direction === "spaces-to-tabs") {
    for (const line of lines) {
      const m = line.match(/^( +)/);
      if (m) {
        const spaceCount = m[1].length;
        const tabCount = Math.floor(spaceCount / width);
        const remainder = spaceCount % width;
        out.push("\t".repeat(tabCount) + " ".repeat(remainder) + line.slice(spaceCount));
      } else {
        out.push(line);
      }
    }
  } else {
    return `Unknown direction: ${direction}. Use tabs-to-spaces or spaces-to-tabs.`;
  }

  return out.join("\n");
}

export const def = {
  name: "convert_indent",
  description:
    "Convert leading indentation between tabs and spaces. Set width to control how many spaces equal one tab.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Source text",
      },
      direction: {
        type: "string",
        enum: ["tabs-to-spaces", "spaces-to-tabs"],
        description: "Conversion direction (default: tabs-to-spaces)",
      },
      width: {
        type: "number",
        description: "Spaces per tab (default: 2)",
      },
    },
    required: ["text"],
  },
};
