export async function read_url(input: Record<string, unknown>): Promise<string> {
  const url = input["url"] as string;
  const maxChars = typeof input["max_chars"] === "number" ? input["max_chars"] : 8000;

  let html: string;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Codrift/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return `Failed to fetch ${url}: HTTP ${resp.status} ${resp.statusText}`;
    html = await resp.text();
  } catch (err) {
    return `Error fetching ${url}: ${String(err)}`;
  }

  // Strip <script>, <style>, <head> blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "");

  // Convert block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, "\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + `\n\n[truncated — ${text.length} total chars]`;
  }

  return text || "No readable content found at this URL.";
}

export const def = {
  name: "read_url",
  description:
    "Fetch a URL and return its readable text content (HTML stripped). Useful for reading documentation, articles, or any web page. Pairs well with web_search.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch and read" },
      max_chars: {
        type: "number",
        description: "Maximum characters to return (default: 8000)",
      },
    },
    required: ["url"],
  },
};
