/** Strip surrounding quotes from a string, or add them. */

export async function quote_strip(input: Record<string, unknown>): Promise<string> {
  const value = input["value"] as string;
  const mode = (input["mode"] as string) || "strip";
  const quote = (input["quote"] as string) || '"';

  if (value == null) return "Error: value is required.";

  if (mode === "strip") {
    let s = value.trim();
    while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) || (s.startsWith("`") && s.endsWith("`"))) {
      s = s.slice(1, -1);
    }
    return s;
  }

  if (mode === "add") {
    return `${quote}${value.replace(new RegExp(quote, "g"), `\\${quote}`)}${quote}`;
  }

  return `Unknown mode: ${mode}. Use strip or add.`;
}

export const def = {
  name: "quote_strip",
  description:
    "Strip surrounding quotes (single, double, or backtick) from a string, or wrap a string in quotes (with proper escaping).",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "Input string",
      },
      mode: {
        type: "string",
        enum: ["strip", "add"],
        description: "Strip surrounding quotes or add new ones (default: strip)",
      },
      quote: {
        type: "string",
        description: "Quote character to add (default: '\"')",
      },
    },
    required: ["value"],
  },
};
