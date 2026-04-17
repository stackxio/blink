export async function http_request(input: Record<string, unknown>): Promise<string> {
  const url = input["url"] as string;
  const method = ((input["method"] as string) ?? "GET").toUpperCase();
  const headers = (input["headers"] as Record<string, string>) ?? {};
  const body = input["body"] as string | undefined;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body != null ? body : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return `Request error: ${String(err)}`;
  }

  const contentType = resp.headers.get("content-type") ?? "";
  let responseBody: string;
  try {
    responseBody = await resp.text();
  } catch {
    responseBody = "(could not read response body)";
  }

  // Pretty-print JSON if possible
  if (contentType.includes("application/json")) {
    try {
      responseBody = JSON.stringify(JSON.parse(responseBody), null, 2);
    } catch {}
  }

  const MAX = 6000;
  if (responseBody.length > MAX) {
    responseBody = responseBody.slice(0, MAX) + `\n[truncated — ${responseBody.length} total chars]`;
  }

  const headerLines: string[] = [];
  resp.headers.forEach((value, key) => headerLines.push(`${key}: ${value}`));

  return [
    `Status: ${resp.status} ${resp.statusText}`,
    `Headers:\n${headerLines.join("\n")}`,
    `Body:\n${responseBody}`,
  ].join("\n\n");
}

export const def = {
  name: "http_request",
  description:
    "Make an HTTP request (GET, POST, PUT, DELETE, PATCH, etc.) and return the status, headers, and response body. Useful for testing APIs or fetching data.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to request" },
      method: {
        type: "string",
        description: "HTTP method (default: GET)",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
      },
      headers: {
        type: "object",
        description: "Additional request headers as key-value pairs",
      },
      body: {
        type: "string",
        description: "Request body (for POST/PUT/PATCH). JSON strings are sent as-is.",
      },
    },
    required: ["url"],
  },
};
