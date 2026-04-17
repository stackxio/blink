import * as fs from "node:fs/promises";

// Very fast approximation: 1 token ≈ 4 characters (matches GPT/Claude heuristics)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function count_tokens(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string | undefined;
  const text = input["text"] as string | undefined;

  if (filePath) {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      return `Cannot read file: ${String(err)}`;
    }
    const tokens = estimateTokens(content);
    const lines = content.split("\n").length;
    const chars = content.length;
    return `File: ${filePath}\nLines: ${lines}\nCharacters: ${chars}\nEstimated tokens: ~${tokens.toLocaleString()}\n(at $0.003/1k tokens = ~$${((tokens / 1000) * 0.003).toFixed(4)})`;
  }

  if (text) {
    const tokens = estimateTokens(text);
    return `Text length: ${text.length} chars\nEstimated tokens: ~${tokens.toLocaleString()}`;
  }

  return "Provide either a file path or text to estimate token count.";
}

export const def = {
  name: "count_tokens",
  description:
    "Estimate the number of tokens in a file or text string. Uses the ~4 chars/token heuristic that matches GPT and Claude models. Useful for understanding context window usage.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to a file to count tokens in",
      },
      text: {
        type: "string",
        description: "Raw text to count tokens in (alternative to path)",
      },
    },
    required: [],
  },
};
