/** Parse, validate, and format JSON. Also supports querying via dot-notation path. */

export async function json_format(input: Record<string, unknown>): Promise<string> {
  const data = input["data"] as string;
  const indent = typeof input["indent"] === "number" ? input["indent"] : 2;
  const path = input["path"] as string | undefined;

  if (typeof data !== "string") return "Error: data is required.";

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (e) {
    // Try to give a helpful error message with location
    const msg = String(e);
    return `Invalid JSON: ${msg}`;
  }

  // Optional: navigate a dot-notation path
  if (path) {
    const parts = path.split(".").filter(Boolean);
    let current: unknown = parsed;
    for (const part of parts) {
      if (current == null || typeof current !== "object") {
        return `Path '${path}' not found: '${part}' is not an object.`;
      }
      const key = part.match(/^\[(\d+)\]$/) ? parseInt(part.slice(1, -1), 10) : part;
      current = (current as Record<string | number, unknown>)[key];
    }
    return `Value at '${path}':\n${JSON.stringify(current, null, indent)}`;
  }

  return `Formatted JSON:\n${JSON.stringify(parsed, null, indent)}`;
}

export const def = {
  name: "json_format",
  description:
    "Parse, validate, and pretty-format a JSON string. Optionally extract a value at a dot-notation path (e.g. 'user.address.city' or 'items[0].name'). Useful for exploring API responses or config files.",
  parameters: {
    type: "object",
    properties: {
      data: {
        type: "string",
        description: "JSON string to parse and format",
      },
      indent: {
        type: "number",
        description: "Indentation spaces for output (default: 2)",
      },
      path: {
        type: "string",
        description: "Optional dot-notation path to extract a specific value (e.g. 'user.name', 'items[0]')",
      },
    },
    required: ["data"],
  },
};
