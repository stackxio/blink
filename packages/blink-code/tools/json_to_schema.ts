/** Generate a JSON Schema (draft-07) from a JSON example. */

function inferType(value: unknown, required: string[]): Record<string, unknown> {
  if (value === null) return { type: ["null", "string"] }; // nullable

  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  }
  if (typeof value === "string") {
    // Heuristic format detection
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return { type: "string", format: "date-time" };
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { type: "string", format: "date" };
    if (/^[a-f0-9-]{36}$/i.test(value)) return { type: "string", format: "uuid" };
    if (/^https?:\/\//.test(value)) return { type: "string", format: "uri" };
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { type: "string", format: "email" };
    if (value.length > 0) return { type: "string", example: value.slice(0, 30) };
    return { type: "string" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array", items: {} };
    // Infer from first item
    const itemSchema = inferType(value[0], []);
    return { type: "array", items: itemSchema };
  }

  if (typeof value === "object") {
    return buildObjectSchema(value as Record<string, unknown>);
  }

  return {};
}

function buildObjectSchema(obj: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, val] of Object.entries(obj)) {
    if (val !== null && val !== undefined) required.push(key);
    properties[key] = inferType(val, []);
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

export async function json_to_schema(input: Record<string, unknown>): Promise<string> {
  const rawData = input["data"] as string | object;
  const title = (input["title"] as string) || "Schema";
  const description = input["description"] as string | undefined;
  const draft = (input["draft"] as string) || "07";

  if (!rawData) return "Error: data is required.";

  let obj: unknown;
  try {
    obj = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
  } catch (e) {
    return `Invalid JSON: ${String(e)}`;
  }

  const schemaUrl = draft === "2020-12"
    ? "https://json-schema.org/draft/2020-12/schema"
    : "http://json-schema.org/draft-07/schema#";

  const base: Record<string, unknown> = {
    $schema: schemaUrl,
    title,
  };

  if (description) base.description = description;

  const bodySchema = typeof obj === "object" && obj !== null && !Array.isArray(obj)
    ? buildObjectSchema(obj as Record<string, unknown>)
    : inferType(obj, []);

  const schema = { ...base, ...bodySchema };

  return `// Generated JSON Schema (draft-${draft})\n${JSON.stringify(schema, null, 2)}`;
}

export const def = {
  name: "json_to_schema",
  description:
    "Generate a JSON Schema (draft-07 or 2020-12) from a JSON example. Detects types, formats (date-time, uuid, email, uri), nested objects, and arrays. Useful for API documentation and validation setup.",
  parameters: {
    type: "object",
    properties: {
      data: {
        description: "JSON example object or JSON string to generate a schema from",
      },
      title: {
        type: "string",
        description: "Schema title (default: 'Schema')",
      },
      description: {
        type: "string",
        description: "Schema description (optional)",
      },
      draft: {
        type: "string",
        enum: ["07", "2020-12"],
        description: "JSON Schema draft version (default: '07')",
      },
    },
    required: ["data"],
  },
};
