import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Run test coverage and parse the summary. */

export async function test_coverage(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    let cmd = "";

    // Detect test framework
    if (existsSync(resolve(absRoot, "Cargo.toml"))) {
      cmd = "cargo test 2>&1 | tail -20";
    } else if (existsSync(resolve(absRoot, "package.json"))) {
      // Check for vitest or jest with coverage
      const pkg = (() => {
        try {
          return JSON.parse(require("fs").readFileSync(resolve(absRoot, "package.json"), "utf8"));
        } catch { return {}; }
      })();
      const hasVitest = pkg.devDependencies?.vitest || pkg.dependencies?.vitest;
      const localVitest = resolve(absRoot, "node_modules/.bin/vitest");
      const localJest = resolve(absRoot, "node_modules/.bin/jest");

      if (hasVitest || existsSync(localVitest)) {
        cmd = `${existsSync(localVitest) ? localVitest : "npx vitest"} run --coverage 2>&1 | tail -40`;
      } else if (existsSync(localJest)) {
        cmd = `${localJest} --coverage --coverageReporters=text 2>&1 | tail -40`;
      } else {
        cmd = "npx jest --coverage --coverageReporters=text 2>&1 | tail -40";
      }
    } else if (existsSync(resolve(absRoot, "pyproject.toml")) || existsSync(resolve(absRoot, "setup.py"))) {
      cmd = "python -m pytest --cov --cov-report=term-missing 2>&1 | tail -30";
    } else if (existsSync(resolve(absRoot, "go.mod"))) {
      cmd = "go test ./... -coverprofile=/tmp/cover.out 2>&1 && go tool cover -func=/tmp/cover.out 2>&1 | tail -20";
    } else {
      resolve_fn("No recognized project type. Support: Node.js (jest/vitest), Rust (cargo), Python (pytest), Go.");
      return;
    }

    exec(cmd, { cwd: absRoot, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh", timeout: 180_000 }, (err, stdout) => {
      const out = stdout?.trim();
      if (!out) {
        resolve_fn(`No coverage output. Error: ${String(err)}`);
        return;
      }
      resolve_fn(out.slice(0, 4000));
    });
  });
}

export const def = {
  name: "test_coverage",
  description:
    "Run tests with coverage reporting and display the summary. Auto-detects the framework: Jest/Vitest (Node.js), cargo test (Rust), pytest-cov (Python), or go test -cover (Go).",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the project (default: current workspace)",
      },
    },
    required: [],
  },
};
