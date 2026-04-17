/** Make an HTTP request and run basic assertions on the response — like a mini API test. */

interface Assertion {
  type: "status" | "header" | "body_contains" | "json_path" | "response_time";
  value?: string | number;
  key?: string;
  max?: number;
}

function getJsonPath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    const idx = part.match(/^\[(\d+)\]$/);
    if (idx) {
      current = (current as unknown[])[parseInt(idx[1], 10)];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

export async function api_test(input: Record<string, unknown>): Promise<string> {
  const url = input["url"] as string;
  const method = ((input["method"] as string) || "GET").toUpperCase();
  const headers = (input["headers"] as Record<string, string>) || {};
  const body = input["body"] as string | undefined;
  const assertions = (input["assertions"] as Assertion[]) || [];

  if (!url) return "Error: url is required.";

  const startMs = Date.now();
  let response: Response;
  let responseBody = "";
  let responseJson: unknown = null;

  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(typeof body === "string" ? JSON.parse(body) : body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    responseBody = await response.text();
    try { responseJson = JSON.parse(responseBody); } catch { /* not JSON */ }
  } catch (e) {
    return `Request failed: ${String(e)}`;
  }

  const elapsed = Date.now() - startMs;

  const lines = [
    `${method} ${url}`,
    `Status: ${response.status} ${response.statusText}`,
    `Time: ${elapsed}ms`,
    `Content-Type: ${response.headers.get("content-type") ?? "(none)"}`,
    "",
    "Response body:",
    responseJson
      ? JSON.stringify(responseJson, null, 2).slice(0, 2000)
      : responseBody.slice(0, 2000),
  ];

  if (responseBody.length > 2000) lines.push("...[truncated]");

  // Run assertions
  if (assertions.length > 0) {
    lines.push("", "=== Assertions ===");
    for (const a of assertions) {
      let passed = false;
      let detail = "";

      switch (a.type) {
        case "status":
          passed = response.status === Number(a.value);
          detail = `Status ${response.status} == ${a.value}`;
          break;
        case "header": {
          const hval = response.headers.get(String(a.key));
          passed = hval != null && (a.value == null || hval.includes(String(a.value)));
          detail = `Header '${a.key}' = '${hval ?? "(missing)"}' ${a.value ? `contains '${a.value}'` : "exists"}`;
          break;
        }
        case "body_contains":
          passed = responseBody.includes(String(a.value));
          detail = `Body contains '${a.value}'`;
          break;
        case "json_path": {
          const actual = getJsonPath(responseJson, String(a.key));
          passed = String(actual) === String(a.value);
          detail = `${a.key} = '${actual}' == '${a.value}'`;
          break;
        }
        case "response_time":
          passed = elapsed <= Number(a.max ?? a.value ?? 5000);
          detail = `Response time ${elapsed}ms <= ${a.max ?? a.value}ms`;
          break;
        default:
          detail = `Unknown assertion type: ${(a as Assertion).type}`;
      }

      lines.push(`  ${passed ? "✅" : "❌"} ${detail}`);
    }
  }

  return lines.join("\n");
}

export const def = {
  name: "api_test",
  description:
    "Make an HTTP request and optionally run assertions on the response (status code, headers, body content, JSON path values, response time). A lightweight API testing tool.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to request",
      },
      method: {
        type: "string",
        description: "HTTP method (default: GET)",
      },
      headers: {
        type: "object",
        description: "Request headers as key-value pairs",
      },
      body: {
        type: "string",
        description: "Request body (JSON string)",
      },
      assertions: {
        type: "array",
        description: "List of assertions to run: { type: 'status'|'header'|'body_contains'|'json_path'|'response_time', value?, key?, max? }",
        items: { type: "object" },
      },
    },
    required: ["url"],
  },
};
