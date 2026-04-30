/** Count words, characters, lines, and reading time of a text blob. */

export async function word_count(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  if (text == null) return "Error: text is required.";

  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, "").length;
  const words = (text.trim().match(/\S+/g) ?? []).length;
  const lines = text.split("\n").length;
  const sentences = (text.match(/[.!?]+(?=\s|$)/g) ?? []).length;
  const paragraphs = text.trim().split(/\n\s*\n/).filter((p) => p.trim()).length;

  // Reading time: 200 wpm
  const minutes = Math.max(1, Math.round(words / 200));

  return [
    `Words:        ${words.toLocaleString()}`,
    `Characters:   ${chars.toLocaleString()}`,
    `Characters (no spaces): ${charsNoSpaces.toLocaleString()}`,
    `Lines:        ${lines.toLocaleString()}`,
    `Sentences:    ${sentences.toLocaleString()}`,
    `Paragraphs:   ${paragraphs.toLocaleString()}`,
    `Reading time: ~${minutes} min (at 200 wpm)`,
  ].join("\n");
}

export const def = {
  name: "word_count",
  description:
    "Count words, characters, lines, sentences, and paragraphs in a text. Also estimates reading time at 200 words/minute.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text to analyze",
      },
    },
    required: ["text"],
  },
};
