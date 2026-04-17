/** Generate a TypeScript interface from a JSON object or JSON string. */

function jsonToInterface(obj: unknown, name: string, indent = 0): string {
  const pad = "  ".repeat(indent);
  const innerPad = "  ".repeat(indent + 1);

  if (obj === null) return "null";
  if (typeof obj === "boolean") return "boolean";
  if (typeof obj === "number") return Number.isInteger(obj) ? "number" : "number";
  if (typeof obj === "string") return "string";

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "unknown[]";
    const itemType = jsonToInterface(obj[0], name + "Item", indent);
    return `${itemType}[]`;
  }

  if (typeof obj === "object") {
    const fields = Object.entries(obj as Record<string, unknown>);
    if (fields.length === 0) return "Record<string, unknown>";

    const lines = [`interface ${name} {`];
    for (const [key, value] of fields) {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
      const optional = value === null ? "?" : "";
      const valType = Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null
        ? jsonToInterface(value[0], capitalize(key), indent + 1) + "[]"
        : jsonToInterface(value, capitalize(key), indent + 1);
      lines.push(`${innerPad}${safeKey}${optional}: ${valType};`);
    }
    lines.push(`${pad}}`);
    return lines.join("\n");
  }

  return "unknown";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function generate_interface(input: Record<string, unknown>): Promise<string> {
  const jsonInput = input["json"] as string | Record<string, unknown>;
  const name = (input["name"] as string) ?? "Root";

  let obj: unknown;
  if (typeof jsonInput === "string") {
    try {
      obj = JSON.parse(jsonInput);
    } catch (e) {
      return `Invalid JSON: ${String(e)}`;
    }
  } else {
    obj = jsonInput;
  }

  const result = jsonToInterface(obj, name, 0);
  return `// Generated TypeScript interface\n${result}`;
}

export const def = {
  name: "generate_interface",
  description:
    "Generate a TypeScript interface definition from a JSON object or JSON string. Useful for quickly creating types from API responses or data structures.",
  parameters: {
    type: "object",
    properties: {
      json: {
        type: "string",
        description: "JSON string or object to generate types from",
      },
      name: {
        type: "string",
        description: "Name for the root interface (default: 'Root')",
      },
    },
    required: ["json"],
  },
};
