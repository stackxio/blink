/** Test a regular expression against a string and return all matches with capture groups. */

export async function regex_test(input: Record<string, unknown>): Promise<string> {
  const pattern = input["pattern"] as string;
  const text = input["text"] as string;
  const flags = (input["flags"] as string) || "";

  if (!pattern || typeof pattern !== "string") return "Error: pattern is required.";
  if (typeof text !== "string") return "Error: text is required.";

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
  } catch (e) {
    return `Invalid regex: ${String(e)}`;
  }

  const matches: string[] = [];
  let m: RegExpExecArray | null;
  let count = 0;

  while ((m = regex.exec(text)) !== null && count < 100) {
    const groups = m.slice(1).map((g, i) => `  Group ${i + 1}: ${g ?? "(undefined)"}`);
    matches.push(
      `Match ${count + 1} at index ${m.index}: ${JSON.stringify(m[0])}${groups.length > 0 ? "\n" + groups.join("\n") : ""}`,
    );
    count++;
    // Prevent infinite loop on zero-length matches
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }

  if (matches.length === 0) {
    return `No matches found for /${pattern}/${flags} in the provided text.`;
  }

  const header = `Found ${matches.length} match(es) for /${pattern}/${flags.replace("g", "")}:`;
  return `${header}\n\n${matches.join("\n\n")}`;
}

export const def = {
  name: "regex_test",
  description:
    "Test a regular expression against text and return all matches with capture groups. Useful for validating regex patterns or extracting structured data.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regular expression pattern (without delimiters)",
      },
      text: {
        type: "string",
        description: "Text to test the regex against",
      },
      flags: {
        type: "string",
        description: "Regex flags: i (case-insensitive), m (multiline), s (dotAll). 'g' is always added. Example: 'im'",
      },
    },
    required: ["pattern", "text"],
  },
};
