import { exec } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs/promises";

export async function format_file(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const root = (input["root"] as string) || path.dirname(filePath);

  const ext = path.extname(filePath).toLowerCase();

  // Detect formatter
  let command: string | null = null;

  const isPrettierSupported = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".html", ".md", ".yaml", ".yml"].includes(ext);
  if (isPrettierSupported) {
    // Check for local prettier
    const localPrettier = path.join(root, "node_modules", ".bin", "prettier");
    try {
      await fs.access(localPrettier);
      command = `${localPrettier} --write ${JSON.stringify(filePath)}`;
    } catch {
      // Try global prettier
      command = `prettier --write ${JSON.stringify(filePath)}`;
    }
  } else if (ext === ".rs") {
    command = `rustfmt ${JSON.stringify(filePath)}`;
  } else if (ext === ".go") {
    command = `gofmt -w ${JSON.stringify(filePath)}`;
  } else if (ext === ".py") {
    command = `black ${JSON.stringify(filePath)} 2>&1 || autopep8 --in-place ${JSON.stringify(filePath)}`;
  } else {
    return `No formatter available for ${ext} files. Supported: .ts/.tsx/.js/.jsx/.json/.css/.md (Prettier), .rs (rustfmt), .go (gofmt), .py (black/autopep8).`;
  }

  return new Promise((resolve) => {
    exec(command!, { cwd: root, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve(`Format failed: ${stderr || String(err)}`);
        return;
      }
      resolve(`✅ Formatted: ${filePath}${stdout ? "\n" + stdout.trim() : ""}${stderr ? "\n" + stderr.trim() : ""}`);
    });
  });
}

export const def = {
  name: "format_file",
  description:
    "Format a source file using the appropriate formatter (Prettier for JS/TS/CSS/JSON/MD, rustfmt for Rust, gofmt for Go, black for Python). Modifies the file in place.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the file to format",
      },
      root: {
        type: "string",
        description: "Project root directory (used to find local node_modules/.bin/prettier)",
      },
    },
    required: ["path"],
  },
};
