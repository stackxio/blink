/** Render a Mustache-style template with provided variables. */

export async function template_render(input: Record<string, unknown>): Promise<string> {
  const template = input["template"] as string;
  const variables = (input["variables"] as Record<string, unknown>) || {};
  const delimiters = (input["delimiters"] as [string, string]) || ["{{", "}}"];

  if (!template) return "Error: template is required.";

  const [open, close] = delimiters;

  // Escape delimiters for regex
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openEsc = escapeRegex(open);
  const closeEsc = escapeRegex(close);

  // Build pattern: {{ key }} or {{key}} or {{#section}}...{{/section}}
  let result = template;

  // Handle conditionals: {{#key}}...{{/key}}
  const sectionPattern = new RegExp(`${openEsc}#(\\w+)${closeEsc}([\\s\\S]*?)${openEsc}\\/(\\1)${closeEsc}`, "g");
  result = result.replace(sectionPattern, (_, key, content) => {
    const val = variables[key];
    if (!val || (Array.isArray(val) && val.length === 0)) return "";
    if (Array.isArray(val)) {
      return val.map((item) => {
        let section = content;
        if (typeof item === "object" && item !== null) {
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            section = section.replace(new RegExp(`${openEsc}${escapeRegex(k)}${closeEsc}`, "g"), String(v ?? ""));
          }
        } else {
          section = section.replace(new RegExp(`${openEsc}\\.${closeEsc}`, "g"), String(item));
        }
        return section;
      }).join("");
    }
    return content;
  });

  // Handle inverted sections: {{^key}}...{{/key}}
  const invertedPattern = new RegExp(`${openEsc}\\^(\\w+)${closeEsc}([\\s\\S]*?)${openEsc}\\/(\\1)${closeEsc}`, "g");
  result = result.replace(invertedPattern, (_, key, content) => {
    const val = variables[key];
    if (!val || (Array.isArray(val) && val.length === 0)) return content;
    return "";
  });

  // Handle simple variable substitution: {{key}}
  const varPattern = new RegExp(`${openEsc}([\\w.]+)${closeEsc}`, "g");
  result = result.replace(varPattern, (_, key) => {
    // Dot notation support
    const parts = key.split(".");
    let val: unknown = variables;
    for (const part of parts) {
      if (val == null || typeof val !== "object") return "";
      val = (val as Record<string, unknown>)[part];
    }
    return val == null ? "" : String(val);
  });

  return result;
}

export const def = {
  name: "template_render",
  description:
    "Render a Mustache-style template with provided variables. Supports variable substitution ({{name}}), conditional sections ({{#show}}...{{/show}}), inverted sections ({{^empty}}...{{/empty}}), arrays, and dot notation ({{user.name}}). Configurable delimiters.",
  parameters: {
    type: "object",
    properties: {
      template: {
        type: "string",
        description: "Template string with {{variable}} placeholders",
      },
      variables: {
        type: "object",
        description: "Key-value map of variables to inject into the template",
      },
      delimiters: {
        type: "array",
        items: { type: "string" },
        description: "Custom open/close delimiters (default: ['{{', '}}'])",
      },
    },
    required: ["template"],
  },
};
