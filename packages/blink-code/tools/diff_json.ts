/** Deep diff two JSON objects and show added, removed, and changed fields. */

type DiffResult =
  | { op: "added"; path: string; value: unknown }
  | { op: "removed"; path: string; value: unknown }
  | { op: "changed"; path: string; from: unknown; to: unknown };

function deepDiff(a: unknown, b: unknown, path = ""): DiffResult[] {
  const results: DiffResult[] = [];

  if (a === b) return results;

  if (
    typeof a !== "object" || typeof b !== "object" ||
    a === null || b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    results.push({ op: "changed", path: path || "(root)", from: a, to: b });
    return results;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const childPath = `${path}[${i}]`;
      if (i >= a.length) {
        results.push({ op: "added", path: childPath, value: b[i] });
      } else if (i >= b.length) {
        results.push({ op: "removed", path: childPath, value: a[i] });
      } else {
        results.push(...deepDiff(a[i], b[i], childPath));
      }
    }
    return results;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

  for (const key of allKeys) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in aObj)) {
      results.push({ op: "added", path: childPath, value: bObj[key] });
    } else if (!(key in bObj)) {
      results.push({ op: "removed", path: childPath, value: aObj[key] });
    } else {
      results.push(...deepDiff(aObj[key], bObj[key], childPath));
    }
  }

  return results;
}

function display(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return JSON.stringify(v);
}

export async function diff_json(input: Record<string, unknown>): Promise<string> {
  const rawA = input["a"] as string | object;
  const rawB = input["b"] as string | object;

  if (rawA == null) return "Error: 'a' is required.";
  if (rawB == null) return "Error: 'b' is required.";

  let a: unknown, b: unknown;

  try {
    a = typeof rawA === "string" ? JSON.parse(rawA) : rawA;
  } catch (e) {
    return `Invalid JSON for 'a': ${String(e)}`;
  }

  try {
    b = typeof rawB === "string" ? JSON.parse(rawB) : rawB;
  } catch (e) {
    return `Invalid JSON for 'b': ${String(e)}`;
  }

  const diffs = deepDiff(a, b);

  if (diffs.length === 0) {
    return "✅ No differences — the two JSON values are identical.";
  }

  const added = diffs.filter((d) => d.op === "added");
  const removed = diffs.filter((d) => d.op === "removed");
  const changed = diffs.filter((d) => d.op === "changed") as Extract<DiffResult, { op: "changed" }>[];

  const lines = [`${diffs.length} difference(s) found:`];

  if (added.length > 0) {
    lines.push(`\n+ Added (${added.length}):`);
    for (const d of added) {
      lines.push(`  + ${d.path}: ${display(d.value)}`);
    }
  }

  if (removed.length > 0) {
    lines.push(`\n- Removed (${removed.length}):`);
    for (const d of removed) {
      lines.push(`  - ${d.path}: ${display(d.value)}`);
    }
  }

  if (changed.length > 0) {
    lines.push(`\n~ Changed (${changed.length}):`);
    for (const d of changed) {
      lines.push(`  ~ ${d.path}: ${display(d.from)} → ${display(d.to)}`);
    }
  }

  return lines.join("\n");
}

export const def = {
  name: "diff_json",
  description:
    "Deep diff two JSON objects and show exactly what was added, removed, or changed — with dot-notation paths. Useful for comparing API responses, config files, or data structures.",
  parameters: {
    type: "object",
    properties: {
      a: {
        description: "First JSON value (string or object)",
      },
      b: {
        description: "Second JSON value to compare against (string or object)",
      },
    },
    required: ["a", "b"],
  },
};
