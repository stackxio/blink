/** Convert CSV to JSON or JSON to CSV. */

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function escapeCsvCell(s: string, delim: string): string {
  if (s.includes(delim) || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function csv_to_json(input: Record<string, unknown>): Promise<string> {
  const value = input["value"] as string;
  const direction = (input["direction"] as string) || "csv-to-json";
  const delimiter = (input["delimiter"] as string) || ",";
  const hasHeader = input["header"] !== false;

  if (!value) return "Error: value is required.";

  if (direction === "json-to-csv") {
    let arr: unknown;
    try {
      arr = JSON.parse(value);
    } catch (e) {
      return `Invalid JSON: ${String(e)}`;
    }
    if (!Array.isArray(arr)) return "Error: JSON must be an array of objects.";
    if (arr.length === 0) return "";
    const keys = Array.from(new Set(arr.flatMap((o) => Object.keys(o as Record<string, unknown>))));
    const lines = [keys.join(delimiter)];
    for (const row of arr) {
      const r = row as Record<string, unknown>;
      lines.push(keys.map((k) => escapeCsvCell(String(r[k] ?? ""), delimiter)).join(delimiter));
    }
    return lines.join("\n");
  }

  const lines = value.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return "[]";

  const rows = lines.map((l) => parseCsvLine(l, delimiter));
  if (hasHeader) {
    const [header, ...data] = rows;
    const objs = data.map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return obj;
    });
    return JSON.stringify(objs, null, 2);
  }
  return JSON.stringify(rows, null, 2);
}

export const def = {
  name: "csv_to_json",
  description:
    "Convert CSV to JSON or JSON to CSV. Handles quoted fields, escaped quotes, configurable delimiter. With header:true (default), CSV first row becomes object keys.",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "CSV or JSON text",
      },
      direction: {
        type: "string",
        enum: ["csv-to-json", "json-to-csv"],
        description: "Conversion direction (default: csv-to-json)",
      },
      delimiter: {
        type: "string",
        description: "Field delimiter (default: ',')",
      },
      header: {
        type: "boolean",
        description: "First CSV row is a header (default: true)",
      },
    },
    required: ["value"],
  },
};
