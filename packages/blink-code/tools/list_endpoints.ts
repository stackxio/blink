import { exec } from "node:child_process";
import { resolve } from "node:path";

/** Find HTTP route definitions across common web frameworks. */

const PATTERNS = [
  // Express / Fastify / Koa Router
  /(app|router|fastify|server)\.(get|post|put|patch|delete|all|head|options)\(\s*['"`]([^'"`]+)['"`]/g,
  // Hono
  /(app)\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/g,
  // Next.js / similar: export const GET = async ... in app/api routes
  /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)/g,
  // Rust: #[get("/path")] axum/actix/rocket
  /#\[(get|post|put|patch|delete|head|options)\(\s*"([^"]+)"/g,
  // FastAPI / Flask
  /@(?:app|router)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g,
  // Django urls.py: path("...", ...) or url(r"...")
  /(?:path|re_path|url)\(\s*r?['"]([^'"]+)['"]/g,
];

export async function list_endpoints(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    exec(
      `git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.rs' '*.go' 2>/dev/null | grep -v node_modules | grep -v test | head -300`,
      { cwd: absRoot, maxBuffer: 4 * 1024 * 1024 },
      async (_, stdout) => {
        const files = stdout.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          resolve_fn("No source files found.");
          return;
        }

        const { readFile } = await import("node:fs/promises");
        const endpoints: { method: string; path: string; file: string; line: number }[] = [];

        for (const file of files) {
          try {
            const absFile = resolve(absRoot, file);
            const content = await readFile(absFile, "utf8");
            const lines = content.split("\n");

            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
              const line = lines[lineIdx];
              for (const pattern of PATTERNS) {
                const re = new RegExp(pattern.source, "g");
                let m: RegExpExecArray | null;
                while ((m = re.exec(line)) !== null) {
                  let method = "?", path = "?";
                  if (m.length >= 4) { method = m[2]; path = m[3]; }
                  else if (m.length === 3) { method = m[1]; path = m[2]; }
                  else if (m.length === 2) { method = "?"; path = m[1]; }
                  endpoints.push({
                    method: method.toUpperCase(),
                    path,
                    file,
                    line: lineIdx + 1,
                  });
                }
              }
            }
          } catch { /* skip */ }
        }

        if (endpoints.length === 0) {
          resolve_fn("No HTTP endpoints found.");
          return;
        }

        endpoints.sort((a, b) => a.path.localeCompare(b.path));
        const lines = [`Found ${endpoints.length} endpoint(s):`, ""];
        for (const e of endpoints.slice(0, 200)) {
          lines.push(`  ${e.method.padEnd(7)} ${e.path.padEnd(40)} ${e.file}:${e.line}`);
        }
        if (endpoints.length > 200) lines.push(`  ... and ${endpoints.length - 200} more`);
        resolve_fn(lines.join("\n"));
      },
    );
  });
}

export const def = {
  name: "list_endpoints",
  description:
    "Scan the codebase for HTTP route definitions across common web frameworks (Express, Hono, Next.js, FastAPI, Flask, Django, Axum, Actix, Rocket). Returns method + path + file:line.",
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
