import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";

export async function run_linter(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const filePath = input["file"] as string | undefined;
  const fix = input["fix"] === true;

  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  // Determine linter to use
  let cmd = "";
  const ext = filePath ? extname(filePath) : "";

  // Rust
  if (
    existsSync(resolve(absRoot, "Cargo.toml")) &&
    (!filePath || [".rs"].includes(ext))
  ) {
    cmd = `cargo clippy ${fix ? "--fix --allow-dirty" : ""} 2>&1 | head -100`;
  }
  // JavaScript/TypeScript
  else if (existsSync(resolve(absRoot, "package.json"))) {
    const localEslint = resolve(absRoot, "node_modules/.bin/eslint");
    const eslintBin = existsSync(localEslint) ? localEslint : "eslint";
    const fixFlag = fix ? "--fix" : "";
    const target = filePath ? JSON.stringify(filePath) : ".";
    cmd = `${eslintBin} ${fixFlag} ${target} 2>&1 | head -100`;
  }
  // Python
  else if (
    existsSync(resolve(absRoot, "pyproject.toml")) ||
    existsSync(resolve(absRoot, "setup.py")) ||
    existsSync(resolve(absRoot, ".flake8"))
  ) {
    const target = filePath ? JSON.stringify(filePath) : ".";
    cmd = `python -m flake8 ${target} 2>&1 | head -100`;
  }
  // Go
  else if (existsSync(resolve(absRoot, "go.mod"))) {
    cmd = `go vet ./... 2>&1 | head -100`;
  }
  else {
    return "No supported linter found. Install ESLint (JS/TS), Clippy (Rust), flake8 (Python), or use a Go workspace.";
  }

  return new Promise((resolve_fn) => {
    exec(cmd, { cwd: absRoot, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout) => {
      const output = stdout?.trim();
      if (!output) {
        resolve_fn(err ? `Linter error: ${String(err)}` : "✅ No lint issues found.");
        return;
      }
      resolve_fn(`Lint results:\n${output}`);
    });
  });
}

export const def = {
  name: "run_linter",
  description:
    "Run the appropriate linter for the project: ESLint (JS/TS), Clippy (Rust), flake8 (Python), or go vet. Optionally auto-fix issues. Returns lint warnings/errors.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the project (default: current workspace)",
      },
      file: {
        type: "string",
        description: "Optional: lint only a specific file",
      },
      fix: {
        type: "boolean",
        description: "If true, attempt to auto-fix lint issues (default: false)",
      },
    },
    required: [],
  },
};
