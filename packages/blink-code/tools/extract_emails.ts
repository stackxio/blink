/** Extract email addresses, phone numbers, or URLs from text. */

const PATTERNS: Record<string, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  url: /\bhttps?:\/\/[^\s<>"']+/g,
  phone: /(?:\+?\d{1,3}[-. ]?)?(?:\(\d{3}\)|\d{3})[-. ]?\d{3}[-. ]?\d{4}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g,
  uuid: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
};

export async function extract_emails(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  const types = (input["types"] as string[]) || ["email", "url", "phone"];
  const unique = input["unique"] !== false;

  if (!text) return "Error: text is required.";

  const results: Record<string, string[]> = {};
  for (const t of types) {
    const re = PATTERNS[t];
    if (!re) continue;
    const matches = text.match(re) || [];
    results[t] = unique ? Array.from(new Set(matches)) : matches;
  }

  const lines: string[] = [];
  for (const [t, items] of Object.entries(results)) {
    lines.push(`${t} (${items.length}):`);
    for (const item of items.slice(0, 100)) lines.push(`  ${item}`);
    if (items.length > 100) lines.push(`  ... and ${items.length - 100} more`);
    lines.push("");
  }

  return lines.join("\n").trim() || "No matches found.";
}

export const def = {
  name: "extract_emails",
  description:
    "Extract emails, URLs, phone numbers, IP addresses (v4/v6), and UUIDs from a text blob. Specify which types to extract via the types array.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Source text to scan",
      },
      types: {
        type: "array",
        items: { type: "string", enum: ["email", "url", "phone", "ipv4", "ipv6", "uuid"] },
        description: "Which patterns to extract (default: ['email', 'url', 'phone'])",
      },
      unique: {
        type: "boolean",
        description: "Deduplicate results (default: true)",
      },
    },
    required: ["text"],
  },
};
