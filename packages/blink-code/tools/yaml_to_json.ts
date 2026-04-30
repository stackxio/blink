/** Convert YAML ↔ JSON. Handles a useful subset (no anchors/tags). */

function parseYaml(text: string): unknown {
  const lines = text.split("\n").filter((l) => !/^\s*#/.test(l) && l.trim() !== "");
  let i = 0;

  function parseValue(s: string): unknown {
    s = s.trim();
    if (s === "" || s === "null" || s === "~") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    if (s.startsWith("[") && s.endsWith("]")) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((x) => parseValue(x));
    }
    if (s.startsWith("{") && s.endsWith("}")) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return {};
      const obj: Record<string, unknown> = {};
      for (const pair of inner.split(",")) {
        const [k, v] = pair.split(":");
        if (k != null && v != null) obj[k.trim()] = parseValue(v);
      }
      return obj;
    }
    return s;
  }

  function indent(line: string): number {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function parseBlock(baseIndent: number): unknown {
    if (i >= lines.length) return null;
    const line = lines[i];
    const ind = indent(line);
    if (ind < baseIndent) return null;
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      const arr: unknown[] = [];
      while (i < lines.length && indent(lines[i]) === baseIndent && lines[i].trim().startsWith("- ")) {
        const itemRaw = lines[i].trim().slice(2);
        i++;
        if (itemRaw.includes(":") && !itemRaw.match(/^["'].*["']$/)) {
          // inline key: value following list marker — back up and parse as object
          const obj: Record<string, unknown> = {};
          const [k, ...rest] = itemRaw.split(":");
          const v = rest.join(":").trim();
          if (v) obj[k.trim()] = parseValue(v);
          else {
            obj[k.trim()] = parseBlock(baseIndent + 2);
          }
          // continue collecting nested keys for this list item
          while (i < lines.length && indent(lines[i]) > baseIndent && !lines[i].trim().startsWith("- ")) {
            const sub = lines[i].trim();
            const [sk, ...sv] = sub.split(":");
            const svStr = sv.join(":").trim();
            if (svStr) {
              obj[sk.trim()] = parseValue(svStr);
              i++;
            } else {
              i++;
              obj[sk.trim()] = parseBlock(indent(lines[i] ?? ""));
            }
          }
          arr.push(obj);
        } else {
          arr.push(parseValue(itemRaw));
        }
      }
      return arr;
    }

    const obj: Record<string, unknown> = {};
    while (i < lines.length && indent(lines[i]) === baseIndent && !lines[i].trim().startsWith("- ")) {
      const t = lines[i].trim();
      const [k, ...rest] = t.split(":");
      const v = rest.join(":").trim();
      i++;
      if (v) {
        obj[k.trim()] = parseValue(v);
      } else {
        const nextInd = i < lines.length ? indent(lines[i]) : baseIndent;
        obj[k.trim()] = parseBlock(nextInd);
      }
    }
    return obj;
  }

  return parseBlock(indent(lines[0] ?? ""));
}

function jsonToYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    if (/[:#\n"']/.test(value)) return JSON.stringify(value);
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map((v) => `${pad}- ${typeof v === "object" && v !== null ? "\n" + jsonToYaml(v, indent + 1) : jsonToYaml(v, indent)}`).join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries.map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return `${pad}${k}:\n${jsonToYaml(v, indent + 1)}`;
      }
      return `${pad}${k}: ${jsonToYaml(v, indent)}`;
    }).join("\n");
  }
  return String(value);
}

export async function yaml_to_json(input: Record<string, unknown>): Promise<string> {
  const value = input["value"] as string;
  const direction = (input["direction"] as string) || "yaml-to-json";

  if (!value) return "Error: value is required.";

  try {
    if (direction === "json-to-yaml") {
      const parsed = JSON.parse(value);
      return jsonToYaml(parsed);
    }
    const parsed = parseYaml(value);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    return `Conversion error: ${String(e)}`;
  }
}

export const def = {
  name: "yaml_to_json",
  description:
    "Convert YAML to JSON or JSON to YAML. Handles a useful subset (scalars, lists, maps, nested structures). Does not support anchors, tags, or multi-document streams.",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "Source YAML or JSON text",
      },
      direction: {
        type: "string",
        enum: ["yaml-to-json", "json-to-yaml"],
        description: "Conversion direction (default: yaml-to-json)",
      },
    },
    required: ["value"],
  },
};
