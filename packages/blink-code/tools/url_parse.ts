/** Parse a URL into its components, or build a URL from parts. */

export async function url_parse(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "parse";
  const url = input["url"] as string;

  if (action === "parse") {
    if (!url) return "Error: url is required.";
    try {
      const u = new URL(url);
      const params: string[] = [];
      u.searchParams.forEach((v, k) => params.push(`  ${k}: ${v}`));
      return [
        `Protocol: ${u.protocol}`,
        `Host: ${u.hostname}`,
        u.port ? `Port: ${u.port}` : null,
        `Path: ${u.pathname}`,
        u.search ? `Query string: ${u.search}` : null,
        params.length > 0 ? `Query params:\n${params.join("\n")}` : null,
        u.hash ? `Hash: ${u.hash}` : null,
        u.username ? `Auth: ${u.username}${u.password ? `:${u.password}` : ""}` : null,
        `Origin: ${u.origin}`,
        `Full URL: ${u.href}`,
      ].filter(Boolean).join("\n");
    } catch (e) {
      return `Invalid URL: ${String(e)}`;
    }
  }

  if (action === "encode") {
    if (!url) return "Error: url is required.";
    return `URL encoded: ${encodeURIComponent(url)}`;
  }

  if (action === "decode") {
    if (!url) return "Error: url is required.";
    try {
      return `URL decoded: ${decodeURIComponent(url)}`;
    } catch (e) {
      return `Decode error: ${String(e)}`;
    }
  }

  if (action === "build") {
    const base = input["base"] as string;
    const params = input["params"] as Record<string, string> | undefined;
    if (!base) return "Error: base is required for 'build'.";
    try {
      const u = new URL(base);
      if (params && typeof params === "object") {
        for (const [k, v] of Object.entries(params)) {
          u.searchParams.set(k, String(v));
        }
      }
      return `Built URL: ${u.href}`;
    } catch (e) {
      return `Build error: ${String(e)}`;
    }
  }

  return `Unknown action: ${action}. Use: parse, encode, decode, build`;
}

export const def = {
  name: "url_parse",
  description:
    "Parse a URL into its components (protocol, host, path, query params, hash), encode/decode URL components, or build a URL from a base + query parameters.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["parse", "encode", "decode", "build"],
        description: "Action: parse (default), encode, decode, or build",
      },
      url: {
        type: "string",
        description: "URL string to parse, encode, or decode",
      },
      base: {
        type: "string",
        description: "Base URL for 'build' action",
      },
      params: {
        type: "object",
        description: "Key-value pairs to add as query parameters (for 'build' action)",
      },
    },
    required: [],
  },
};
