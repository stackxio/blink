import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export async function install_dependency(input: Record<string, unknown>): Promise<string> {
  const pkg = input["package"] as string;
  const root = (input["root"] as string) || process.cwd();
  const dev = input["dev"] === true;

  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  if (!pkg || typeof pkg !== "string") {
    return "Error: package name is required.";
  }

  let cmd = "";

  // Rust
  if (existsSync(resolve(absRoot, "Cargo.toml"))) {
    cmd = `cargo add ${pkg}`;
  }
  // Node — prefer bun > pnpm > yarn > npm
  else if (existsSync(resolve(absRoot, "package.json"))) {
    const devFlag = dev ? " --dev" : "";
    if (existsSync(resolve(absRoot, "bun.lockb")) || existsSync(resolve(absRoot, "bun.lock"))) {
      cmd = `bun add${devFlag} ${pkg}`;
    } else if (existsSync(resolve(absRoot, "pnpm-lock.yaml"))) {
      cmd = `pnpm add${devFlag} ${pkg}`;
    } else if (existsSync(resolve(absRoot, "yarn.lock"))) {
      cmd = `yarn add${dev ? " -D" : ""} ${pkg}`;
    } else {
      cmd = `npm install${dev ? " --save-dev" : ""} ${pkg}`;
    }
  }
  // Python
  else if (
    existsSync(resolve(absRoot, "pyproject.toml")) ||
    existsSync(resolve(absRoot, "requirements.txt"))
  ) {
    cmd = `pip install ${pkg}`;
  }
  // Go
  else if (existsSync(resolve(absRoot, "go.mod"))) {
    cmd = `go get ${pkg}`;
  }
  else {
    return "No recognized project type found (no Cargo.toml, package.json, pyproject.toml, or go.mod).";
  }

  return new Promise((resolve_fn) => {
    exec(cmd, { cwd: absRoot, maxBuffer: 2 * 1024 * 1024, timeout: 120_000 }, (err, stdout, stderr) => {
      const output = (stdout + stderr).trim().slice(0, 3000);
      if (err && !output) {
        resolve_fn(`Install failed: ${String(err)}`);
        return;
      }
      resolve_fn(`Ran: ${cmd}\n\n${output || "Done (no output)."}`);
    });
  });
}

export const def = {
  name: "install_dependency",
  description:
    "Install a dependency for the project using the appropriate package manager: cargo add (Rust), bun/pnpm/yarn/npm add (Node.js), pip install (Python), or go get (Go). Auto-detects the right tool from lockfiles.",
  parameters: {
    type: "object",
    properties: {
      package: {
        type: "string",
        description: "Package name to install (e.g. 'react', 'serde', 'requests')",
      },
      root: {
        type: "string",
        description: "Root directory of the project (default: current workspace)",
      },
      dev: {
        type: "boolean",
        description: "Install as a dev dependency (Node.js only, default: false)",
      },
    },
    required: ["package"],
  },
};
