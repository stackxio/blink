/** Check whether URLs in a text are reachable (HTTP HEAD). */

export async function check_links(input: Record<string, unknown>): Promise<string> {
  const text = input["text"] as string;
  const urls = input["urls"] as string[] | undefined;
  const timeout = typeof input["timeout"] === "number" ? input["timeout"] : 5000;

  let toCheck: string[] = [];
  if (Array.isArray(urls) && urls.length > 0) {
    toCheck = urls;
  } else if (text) {
    const matches = text.match(/\bhttps?:\/\/[^\s<>"')]+/g) || [];
    toCheck = Array.from(new Set(matches));
  } else {
    return "Error: provide either `urls` array or `text` to scan.";
  }

  if (toCheck.length === 0) return "No URLs found.";
  if (toCheck.length > 50) return `Too many URLs (${toCheck.length}). Limit is 50.`;

  const results = await Promise.all(toCheck.map(async (url) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
      clearTimeout(t);
      return { url, status: res.status, ok: res.ok };
    } catch (e) {
      const msg = String(e).slice(0, 80);
      return { url, status: 0, ok: false, error: msg };
    }
  }));

  const lines = [`Checked ${results.length} URL(s):`, ""];
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    const status = r.status === 0 ? "ERR" : String(r.status);
    lines.push(`  ${icon} ${status.padEnd(4)} ${r.url}${r.error ? `  (${r.error})` : ""}`);
  }
  const broken = results.filter((r) => !r.ok).length;
  lines.push("", `${broken === 0 ? "All links OK" : `${broken} broken link(s)`}.`);
  return lines.join("\n");
}

export const def = {
  name: "check_links",
  description:
    "Check whether URLs are reachable using HTTP HEAD requests. Pass either an explicit `urls` array, or a `text` blob to scan for http(s) URLs. Returns status code per URL. Limit: 50 URLs per call.",
  parameters: {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description: "Explicit URLs to check",
      },
      text: {
        type: "string",
        description: "Text blob to scan for URLs",
      },
      timeout: {
        type: "number",
        description: "Per-request timeout in ms (default: 5000)",
      },
    },
    required: [],
  },
};
