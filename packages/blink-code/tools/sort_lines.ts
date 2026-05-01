/** Sort lines of text with various options. */

export async function sort_lines(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  const reverse = input["reverse"] === true;
  const unique = input["unique"] === true;
  const ignoreCase = input["ignore_case"] === true;
  const numeric = input["numeric"] === true;
  const byLength = input["by_length"] === true;

  if (text == null) return "Error: text is required.";

  let lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  if (unique) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of lines) {
      const key = ignoreCase ? l.toLowerCase() : l;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(l);
      }
    }
    lines = out;
  }

  lines.sort((a, b) => {
    if (byLength) return a.length - b.length;
    const aa = ignoreCase ? a.toLowerCase() : a;
    const bb = ignoreCase ? b.toLowerCase() : b;
    if (numeric) {
      const na = parseFloat(aa);
      const nb = parseFloat(bb);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
    }
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });

  if (reverse) lines.reverse();
  return lines.join("\n");
}

export const def = {
  name: "sort_lines",
  description:
    "Sort lines of a text blob with options: reverse order, deduplicate, case-insensitive, numeric, by length.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text to sort",
      },
      reverse: {
        type: "boolean",
        description: "Reverse sort order (default: false)",
      },
      unique: {
        type: "boolean",
        description: "Remove duplicate lines (default: false)",
      },
      ignore_case: {
        type: "boolean",
        description: "Sort case-insensitively (default: false)",
      },
      numeric: {
        type: "boolean",
        description: "Sort by numeric value (default: false)",
      },
      by_length: {
        type: "boolean",
        description: "Sort by line length instead of content (default: false)",
      },
    },
    required: ["text"],
  },
};
