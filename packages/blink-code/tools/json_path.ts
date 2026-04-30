/** Query JSON using a simple JSONPath-like expression. */

function tokenize(path: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < path.length) {
    const c = path[i];
    if (c === "$" || c === ".") {
      i++;
      continue;
    }
    if (c === "[") {
      const end = path.indexOf("]", i);
      if (end === -1) throw new Error("unterminated [");
      let inner = path.slice(i + 1, end).trim();
      if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
        inner = inner.slice(1, -1);
      }
      tokens.push(inner);
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
    const key = path.slice(i, j).trim();
    if (key) tokens.push(key);
    i = j;
  }
  return tokens;
}

function applyTokens(value: unknown, tokens: string[]): unknown[] {
  let current: unknown[] = [value];
  for (const t of tokens) {
    const next: unknown[] = [];
    for (const v of current) {
      if (v == null) continue;
      if (t === "*") {
        if (Array.isArray(v)) next.push(...v);
        else if (typeof v === "object") next.push(...Object.values(v as Record<string, unknown>));
      } else if (t === "..") {
        // recursive descent — not supported in this minimal impl
        next.push(v);
      } else if (/^\d+$/.test(t) && Array.isArray(v)) {
        const idx = parseInt(t, 10);
        if (idx < v.length) next.push(v[idx]);
      } else if (typeof v === "object" && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if (t in o) next.push(o[t]);
      } else if (Array.isArray(v)) {
        // Apply token to each item
        for (const item of v) {
          if (item != null && typeof item === "object" && t in (item as Record<string, unknown>)) {
            next.push((item as Record<string, unknown>)[t]);
          }
        }
      }
    }
    current = next;
  }
  return current;
}

export async function json_path(input: Record<string, unknown>): Promise<string> {
  const value = input["value"] as string;
  const path = input["path"] as string;

  if (!value) return "Error: value is required.";
  if (!path) return "Error: path is required.";

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (e) {
    return `Invalid JSON: ${String(e)}`;
  }

  let tokens: string[];
  try {
    tokens = tokenize(path);
  } catch (e) {
    return `Invalid path: ${String(e)}`;
  }

  const results = applyTokens(parsed, tokens);
  if (results.length === 0) return "No matches.";
  if (results.length === 1) return JSON.stringify(results[0], null, 2);
  return JSON.stringify(results, null, 2);
}

export const def = {
  name: "json_path",
  description:
    "Query a JSON document using a simple dot/bracket path expression. Supports keys (.foo), array indexing ([0]), wildcards (*), bracket key access (['my-key']). Example: $.users[*].name",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "JSON document as a string",
      },
      path: {
        type: "string",
        description: "Path expression (e.g. $.users[0].name, $.items[*].id)",
      },
    },
    required: ["value", "path"],
  },
};
