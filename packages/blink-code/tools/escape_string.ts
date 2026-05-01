/** Escape a string for various contexts: HTML, JS, shell, regex, SQL, JSON. */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

export async function escape_string(input: Record<string, unknown>): Promise<string> {
  const value = input["value"] as string;
  const context = (input["context"] as string) || "html";
  const mode = (input["mode"] as string) || "escape";

  if (value == null) return "Error: value is required.";

  if (mode === "unescape") {
    switch (context) {
      case "html": {
        return value
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      }
      case "js":
      case "json": {
        try {
          return JSON.parse(`"${value}"`);
        } catch { return value; }
      }
      case "shell":
        return value.replace(/\\(.)/g, "$1");
      case "regex":
        return value.replace(/\\(.)/g, "$1");
      case "sql":
        return value.replace(/''/g, "'");
      default: return value;
    }
  }

  switch (context) {
    case "html":
      return value.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
    case "js":
    case "json":
      return JSON.stringify(value).slice(1, -1);
    case "shell":
      return `'${value.replace(/'/g, "'\\''")}'`;
    case "regex":
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    case "sql":
      return value.replace(/'/g, "''");
    case "url":
      return encodeURIComponent(value);
    default:
      return `Unknown context: ${context}. Use html, js, json, shell, regex, sql, or url.`;
  }
}

export const def = {
  name: "escape_string",
  description:
    "Escape or unescape a string for a specific context. Contexts: html (entities), js/json (string literal), shell (single-quoted), regex (regex special chars), sql (single quotes), url (percent-encoding).",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "String to escape or unescape",
      },
      context: {
        type: "string",
        enum: ["html", "js", "json", "shell", "regex", "sql", "url"],
        description: "Target context (default: html)",
      },
      mode: {
        type: "string",
        enum: ["escape", "unescape"],
        description: "Direction (default: escape)",
      },
    },
    required: ["value"],
  },
};
