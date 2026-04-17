import { exec } from "node:child_process";

// Patterns to find definitions for common languages
const DEFINITION_PATTERN = [
  // JS/TS: function foo, const foo, class Foo, export function foo
  `(export\\s+)?(async\\s+)?function\\s+`,
  `(export\\s+)?(const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(async\\s+)?[({(]`,
  `(export\\s+)?class\\s+`,
  // Python: def foo, class Foo
  `(async\\s+)?def\\s+`,
  // Rust: fn foo, pub fn foo, pub async fn foo
  `(pub\\s+)?(async\\s+)?fn\\s+`,
  `(pub\\s+)?struct\\s+`,
  `(pub\\s+)?enum\\s+`,
  `(pub\\s+)?trait\\s+`,
  // Go: func Foo, type Foo
  `func\\s+`,
  `type\\s+`,
].join("|");

export async function workspace_symbol_search(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const symbol = input["symbol"] as string;
  const limit = typeof input["limit"] === "number" ? input["limit"] : 30;

  if (!symbol || symbol.trim().length === 0) {
    return "Please provide a symbol name to search for.";
  }

  return new Promise((resolve) => {
    // Use ripgrep to find definition sites
    // Pattern: match definition keywords followed by the symbol name
    const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `(${DEFINITION_PATTERN})${escapedSymbol}[\\s(<{:]`;

    const rgCmd = `rg -n --no-heading -i --max-count 2 --type-not lock -- ${JSON.stringify(pattern)} ${JSON.stringify(root)}`;

    exec(rgCmd, { maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (stdout && stdout.trim()) {
        const lines = stdout.trim().split("\n").slice(0, limit);
        resolve(lines.join("\n"));
        return;
      }

      // Fallback: grep for any occurrence of the symbol with some context
      const grepCmd = `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.rs" --include="*.go" --include="*.java" -w -- ${JSON.stringify(symbol)} ${JSON.stringify(root)}`;
      exec(grepCmd, { maxBuffer: 5 * 1024 * 1024 }, (_e2, stdout2) => {
        const lines = (stdout2 || "").trim().split("\n").filter(Boolean).slice(0, limit);
        resolve(lines.length > 0 ? lines.join("\n") : `Symbol '${symbol}' not found in workspace.`);
      });
    });
  });
}

export const def = {
  name: "workspace_symbol_search",
  description:
    "Search for a function, class, variable, or type definition by name across the workspace. Returns file paths, line numbers, and matching lines. Useful for quickly locating where something is defined.",
  parameters: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "The symbol name to search for (function name, class name, variable name, etc.)",
      },
      root: {
        type: "string",
        description: "Root directory to search (default: current workspace)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 30)",
      },
    },
    required: ["symbol"],
  },
};
