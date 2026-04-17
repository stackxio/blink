/** Apply common string transformations. */

function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

function toCamelCase(s: string): string {
  return s
    .replace(/[\s\-_]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase());
}

function toPascalCase(s: string): string {
  const camel = toCamelCase(s);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toKebabCase(s: string): string {
  return toSnakeCase(s).replace(/_/g, "-");
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function toConstantCase(s: string): string {
  return toSnakeCase(s).toUpperCase();
}

function truncate(s: string, max: number, ellipsis = "…"): string {
  return s.length > max ? s.slice(0, max - ellipsis.length) + ellipsis : s;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function string_transform(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  const operation = input["operation"] as string;

  if (typeof text !== "string") return "Error: text is required.";
  if (!operation) return "Error: operation is required.";

  switch (operation) {
    case "snake_case":     return toSnakeCase(text);
    case "camel_case":     return toCamelCase(text);
    case "pascal_case":    return toPascalCase(text);
    case "kebab_case":     return toKebabCase(text);
    case "title_case":     return toTitleCase(text);
    case "constant_case":  return toConstantCase(text);
    case "uppercase":      return text.toUpperCase();
    case "lowercase":      return text.toLowerCase();
    case "reverse":        return text.split("").reverse().join("");
    case "trim":           return text.trim();
    case "strip_html":     return text.replace(/<[^>]+>/g, "");
    case "strip_accents":  return stripAccents(text);
    case "word_count":     return `Words: ${text.trim().split(/\s+/).filter(Boolean).length}`;
    case "char_count":     return `Characters: ${text.length} (${text.replace(/\s/g, "").length} non-whitespace)`;
    case "line_count":     return `Lines: ${text.split("\n").length}`;
    case "truncate": {
      const max = typeof input["max"] === "number" ? input["max"] : 100;
      return truncate(text, max);
    }
    case "repeat": {
      const n = typeof input["count"] === "number" ? input["count"] : 2;
      return text.repeat(Math.min(n, 100));
    }
    case "slug": {
      return stripAccents(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    }
    default:
      return `Unknown operation: ${operation}. Supported: snake_case, camel_case, pascal_case, kebab_case, title_case, constant_case, uppercase, lowercase, reverse, trim, strip_html, strip_accents, word_count, char_count, line_count, truncate, repeat, slug`;
  }
}

export const def = {
  name: "string_transform",
  description:
    "Apply common string transformations: case conversions (snake_case, camelCase, PascalCase, kebab-case, CONSTANT_CASE, Title Case), text operations (uppercase, lowercase, reverse, trim, strip_html, slug, truncate, repeat), and text statistics (word_count, char_count, line_count).",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The input text to transform",
      },
      operation: {
        type: "string",
        description: "Transformation to apply (e.g. 'snake_case', 'camel_case', 'word_count', etc.)",
      },
      max: {
        type: "number",
        description: "Max characters for 'truncate' operation (default: 100)",
      },
      count: {
        type: "number",
        description: "Repeat count for 'repeat' operation (default: 2)",
      },
    },
    required: ["text", "operation"],
  },
};
