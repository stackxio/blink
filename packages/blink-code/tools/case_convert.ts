/** Convert a string between snake_case, camelCase, kebab-case, PascalCase, etc. */

function splitWords(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export async function case_convert(input: Record<string, unknown>): Promise<string> {
  const value = input["value"] as string;
  const target = (input["target"] as string) || "all";

  if (!value) return "Error: value is required.";
  const words = splitWords(value);
  if (words.length === 0) return "";

  const cases: Record<string, string> = {
    "snake_case": words.join("_"),
    "SCREAMING_SNAKE": words.join("_").toUpperCase(),
    "kebab-case": words.join("-"),
    "SCREAMING-KEBAB": words.join("-").toUpperCase(),
    "camelCase": words.map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join(""),
    "PascalCase": words.map((w) => w[0].toUpperCase() + w.slice(1)).join(""),
    "Title Case": words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
    "lower case": words.join(" "),
    "UPPER CASE": words.join(" ").toUpperCase(),
    "dot.case": words.join("."),
    "path/case": words.join("/"),
  };

  if (target !== "all" && cases[target] != null) {
    return cases[target];
  }

  return Object.entries(cases).map(([k, v]) => `${k.padEnd(18)} ${v}`).join("\n");
}

export const def = {
  name: "case_convert",
  description:
    "Convert a string between common case styles: snake_case, SCREAMING_SNAKE, kebab-case, camelCase, PascalCase, Title Case, dot.case, path/case. Pass target='all' to see all variations at once.",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "Input string",
      },
      target: {
        type: "string",
        description: "Target case (or 'all' to see all variations). One of: snake_case, SCREAMING_SNAKE, kebab-case, SCREAMING-KEBAB, camelCase, PascalCase, 'Title Case', 'lower case', 'UPPER CASE', dot.case, path/case",
      },
    },
    required: ["value"],
  },
};
