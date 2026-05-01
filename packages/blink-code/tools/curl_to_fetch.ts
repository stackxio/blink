/** Convert a curl command to a JavaScript fetch() call. */

export async function curl_to_fetch(input: Record<string, unknown>): Promise<string> {
  const command = input["command"] as string;
  if (!command) return "Error: command is required.";

  // Strip leading 'curl' and continuation backslashes/newlines
  let s = command.replace(/\\\n/g, " ").trim();
  if (s.startsWith("curl ")) s = s.slice(5);

  let url = "";
  let method = "GET";
  const headers: Record<string, string> = {};
  let body: string | null = null;

  // Tokenize naively respecting quotes
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === '"' || c === "'") {
      const end = s.indexOf(c, i + 1);
      if (end === -1) { tokens.push(s.slice(i + 1)); break; }
      tokens.push(s.slice(i + 1, end));
      i = end + 1;
    } else {
      let j = i;
      while (j < s.length && s[j] !== " " && s[j] !== "\t") j++;
      tokens.push(s.slice(i, j));
      i = j;
    }
  }

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t === "-X" || t === "--request") {
      method = (tokens[++k] || "GET").toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const h = tokens[++k] || "";
      const colon = h.indexOf(":");
      if (colon > 0) {
        headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
      }
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      body = tokens[++k] || "";
      if (method === "GET") method = "POST";
    } else if (t === "-u" || t === "--user") {
      const auth = tokens[++k] || "";
      headers["Authorization"] = `Basic ${Buffer.from(auth).toString("base64")}`;
    } else if (t === "--compressed" || t === "-L" || t === "--location" || t === "-i" || t === "-v" || t === "-s") {
      // ignore
    } else if (t.startsWith("http://") || t.startsWith("https://")) {
      url = t;
    } else if (!t.startsWith("-") && !url) {
      url = t;
    }
  }

  if (!url) return "Error: could not extract URL from curl command.";

  const opts: Record<string, unknown> = {};
  if (method !== "GET") opts.method = method;
  if (Object.keys(headers).length > 0) opts.headers = headers;
  if (body != null) opts.body = body;

  const optsStr = Object.keys(opts).length > 0 ? `, ${JSON.stringify(opts, null, 2)}` : "";
  return `const response = await fetch(${JSON.stringify(url)}${optsStr});\nconst data = await response.json();`;
}

export const def = {
  name: "curl_to_fetch",
  description:
    "Convert a curl command to an equivalent JavaScript fetch() call. Handles -X, -H, -d/--data, -u (basic auth), and URL extraction.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "curl command to convert (with or without leading 'curl')",
      },
    },
    required: ["command"],
  },
};
