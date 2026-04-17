import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Parse CSV content into a table or JSON, with optional column filtering. */

function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let current = "";

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === delimiter && !inQuote) {
        cols.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cols.push(current);
    rows.push(cols);
  }
  return rows;
}

export async function parse_csv(input: Record<string, unknown>): Promise<string> {
  const filePath = input["file"] as string | undefined;
  const csvData = input["data"] as string | undefined;
  const root = (input["root"] as string) || process.cwd();
  const delimiter = (input["delimiter"] as string) || ",";
  const format = (input["format"] as string) || "table";
  const limit = typeof input["limit"] === "number" ? input["limit"] : 50;
  const columns = input["columns"] as string[] | undefined;

  let raw = "";

  if (filePath) {
    const absPath = filePath.startsWith("/") ? filePath : resolve(root, filePath);
    try {
      raw = await readFile(absPath, "utf8");
    } catch (e) {
      return `Error reading file: ${String(e)}`;
    }
  } else if (csvData) {
    raw = csvData;
  } else {
    return "Error: either 'file' or 'data' is required.";
  }

  const rows = parseCsv(raw, delimiter);
  if (rows.length === 0) return "No data found in CSV.";

  const headers = rows[0];
  const dataRows = rows.slice(1, limit + 1);
  const totalRows = rows.length - 1;

  // Filter columns if specified
  let colIndices = headers.map((_, i) => i);
  let activeHeaders = headers;
  if (columns && columns.length > 0) {
    colIndices = columns.map((c) => headers.indexOf(c)).filter((i) => i >= 0);
    activeHeaders = colIndices.map((i) => headers[i]);
  }

  if (format === "json") {
    const objects = dataRows.map((row) => {
      const obj: Record<string, string> = {};
      for (const idx of colIndices) {
        obj[headers[idx]] = row[idx] ?? "";
      }
      return obj;
    });
    return `${totalRows} rows total (showing ${dataRows.length}):\n${JSON.stringify(objects, null, 2)}`;
  }

  // Table format
  const colWidths = activeHeaders.map((h, colPos) => {
    const idx = colIndices[colPos];
    const maxDataLen = Math.max(...dataRows.map((r) => (r[idx] ?? "").length));
    return Math.min(Math.max(h.length, maxDataLen), 40);
  });

  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);

  const headerRow = activeHeaders.map((h, i) => pad(h, colWidths[i])).join(" | ");
  const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
  const dataLines = dataRows.map((row) =>
    colIndices.map((idx, pos) => pad(row[idx] ?? "", colWidths[pos])).join(" | "),
  );

  const suffix = totalRows > limit ? `\n... and ${totalRows - limit} more rows (total: ${totalRows})` : "";
  return `${totalRows} rows, ${headers.length} columns\n\n${headerRow}\n${separator}\n${dataLines.join("\n")}${suffix}`;
}

export const def = {
  name: "parse_csv",
  description:
    "Parse a CSV file or CSV string and display as a formatted table or JSON array. Supports custom delimiters, column filtering, and row limits.",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to CSV file (absolute or relative to root)",
      },
      data: {
        type: "string",
        description: "Inline CSV string to parse (alternative to file)",
      },
      delimiter: {
        type: "string",
        description: "Column delimiter (default: ','). Use '\\t' for TSV.",
      },
      format: {
        type: "string",
        enum: ["table", "json"],
        description: "Output format: table (default) or json",
      },
      limit: {
        type: "number",
        description: "Max rows to display (default: 50)",
      },
      columns: {
        type: "array",
        items: { type: "string" },
        description: "Only show these column names (default: all columns)",
      },
      root: {
        type: "string",
        description: "Base directory for relative file paths (default: current workspace)",
      },
    },
    required: [],
  },
};
