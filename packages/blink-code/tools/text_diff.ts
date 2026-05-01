/** Show line-level differences between two text blobs. */

function diff(a: string[], b: string[]): { type: "same" | "added" | "removed"; line: string }[] {
  const m = a.length, n = b.length;
  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: { type: "same" | "added" | "removed"; line: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "same", line: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "added", line: b[j - 1] });
      j--;
    } else {
      ops.push({ type: "removed", line: a[i - 1] });
      i--;
    }
  }
  return ops.reverse();
}

export async function text_diff(input: Record<string, unknown>): Promise<string> {
  const a = input["a"] as string;
  const b = input["b"] as string;
  const context = typeof input["context"] === "number" ? input["context"] : 3;

  if (a == null || b == null) return "Error: both a and b are required.";

  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const ops = diff(aLines, bLines);

  if (!ops.some((o) => o.type !== "same")) {
    return "✓ Texts are identical.";
  }

  // Build hunks with context
  const out: string[] = [];
  let added = 0, removed = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === "added") {
      out.push(`+ ${op.line}`);
      added++;
    } else if (op.type === "removed") {
      out.push(`- ${op.line}`);
      removed++;
    } else {
      // same — only show if within `context` lines of a change
      const nearChange = ops.slice(Math.max(0, i - context), Math.min(ops.length, i + context + 1))
        .some((o) => o.type !== "same");
      if (nearChange) out.push(`  ${op.line}`);
      else if (out[out.length - 1] !== "...") out.push("...");
    }
  }

  return [`@@ +${added} -${removed} @@`, "", ...out].join("\n").slice(0, 8000);
}

export const def = {
  name: "text_diff",
  description:
    "Compute a line-level diff between two text blobs (LCS-based). Shows added/removed/unchanged lines with configurable context.",
  parameters: {
    type: "object",
    properties: {
      a: {
        type: "string",
        description: "First text (the 'before')",
      },
      b: {
        type: "string",
        description: "Second text (the 'after')",
      },
      context: {
        type: "number",
        description: "Lines of unchanged context to keep around changes (default: 3)",
      },
    },
    required: ["a", "b"],
  },
};
