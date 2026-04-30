/** Pretty-print a SQL query with basic indentation and uppercased keywords. */

const KEYWORDS = new Set([
  "select", "from", "where", "and", "or", "not", "in", "is", "null",
  "join", "inner", "left", "right", "outer", "on", "using",
  "group", "by", "order", "having", "limit", "offset",
  "insert", "into", "values", "update", "set", "delete",
  "create", "table", "alter", "drop", "index", "view", "as",
  "case", "when", "then", "else", "end",
  "union", "all", "distinct", "exists", "between", "like",
  "with", "returning", "primary", "key", "foreign", "references",
  "constraint", "unique", "default", "check", "cascade",
  "asc", "desc", "true", "false",
]);

const NEWLINE_BEFORE = new Set([
  "select", "from", "where", "join", "inner", "left", "right", "outer",
  "group", "order", "having", "limit", "offset", "union", "with",
  "returning", "values", "set",
]);

export async function sql_format(input: Record<string, unknown>): Promise<string> {
  const sql = input["sql"] as string;
  const upper = input["uppercase"] !== false;

  if (!sql) return "Error: sql is required.";

  // Normalize whitespace
  let s = sql.replace(/\s+/g, " ").trim();

  // Tokenize naively
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      // string literal
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\") j++;
        j++;
      }
      tokens.push(s.slice(i, j + 1));
      i = j + 1;
    } else if (/\s/.test(c)) {
      i++;
    } else if (/[a-zA-Z0-9_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      tokens.push(s.slice(i, j));
      i = j;
    } else {
      tokens.push(c);
      i++;
    }
  }

  let depth = 0;
  const out: string[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const lower = t.toLowerCase();
    const isKeyword = KEYWORDS.has(lower);
    const display = isKeyword && upper ? t.toUpperCase() : t;

    if (t === "(") {
      depth++;
      out.push(t);
      continue;
    }
    if (t === ")") {
      depth = Math.max(0, depth - 1);
      out.push(t);
      continue;
    }
    if (t === ",") {
      out.push(",\n" + "  ".repeat(depth + 1));
      continue;
    }
    if (NEWLINE_BEFORE.has(lower) && out.length > 0 && depth === 0) {
      out.push("\n");
    }
    if (out.length > 0 && !out[out.length - 1].endsWith("\n") && !out[out.length - 1].endsWith(" ") && t !== ";" && t !== ".") {
      const last = out[out.length - 1];
      if (!last.endsWith("(") && t !== ")") {
        out.push(" ");
      }
    }
    out.push(display);
  }

  return out.join("").replace(/\n\s*\n/g, "\n").replace(/ +\n/g, "\n").trim();
}

export const def = {
  name: "sql_format",
  description:
    "Pretty-print a SQL query with line breaks before major clauses (SELECT, FROM, WHERE, JOIN, etc.) and uppercased keywords. Lightweight, no external dependencies.",
  parameters: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "SQL query to format",
      },
      uppercase: {
        type: "boolean",
        description: "Uppercase keywords (default: true)",
      },
    },
    required: ["sql"],
  },
};
