/** Remove ANSI escape sequences (color codes, cursor movements) from text. */

export async function strip_ansi(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  if (text == null) return "Error: text is required.";

  // Match ANSI escape sequences: ESC [ ... <letter>, plus other CSI/OSC sequences
  // Reference: https://en.wikipedia.org/wiki/ANSI_escape_code
  const ansiRegex = /[][[()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-ntqry=><~]))/g;
  return text.replace(ansiRegex, "");
}

export const def = {
  name: "strip_ansi",
  description:
    "Remove ANSI escape sequences (color codes, cursor movements, etc.) from a text blob — useful for cleaning up captured terminal output.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text containing ANSI escape sequences",
      },
    },
    required: ["text"],
  },
};
