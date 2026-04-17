import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

/** Measure code complexity metrics for a source file. */

interface FunctionMetric {
  name: string;
  line: number;
  lines: number;
  complexity: number; // rough cyclomatic complexity
  params: number;
}

function countComplexity(text: string): number {
  // Count branch points: if, else if, for, while, switch case, catch, &&, ||, ternary
  const patterns = [
    /\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g,
    /\bcase\s+/g, /\bcatch\s*\(/g, /&&/g, /\|\|/g, /\?\s*[^:]/g,
  ];
  let count = 1;
  for (const p of patterns) {
    count += (text.match(p) ?? []).length;
  }
  return count;
}

function extractFunctions(content: string, ext: string): FunctionMetric[] {
  const lines = content.split("\n");
  const funcs: FunctionMetric[] = [];

  // Pattern to detect function definitions
  const funcPatterns = [
    // JS/TS: function foo(...) { or async function foo(...)
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    // Arrow functions: const foo = (...) => {  or  const foo = async (...) => {
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w[\w<>, ]*\s*)?\s*=>/,
    // Class methods: foo(...) { or async foo(...) {
    /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[\w<>[\], ]+\s*)?\{/,
    // Rust: fn foo(
    /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(/,
    // Python: def foo(
    /def\s+(\w+)\s*\(/,
    // Go: func foo(
    /func\s+(\w+)\s*\(/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of funcPatterns) {
      const m = line.match(pattern);
      if (!m || !m[1]) continue;
      const name = m[1];
      if (["if", "for", "while", "switch", "catch", "return", "new"].includes(name)) continue;

      // Estimate function body length by counting until brace balance returns to 0
      let depth = 0;
      let endLine = i;
      let started = false;
      for (let j = i; j < Math.min(i + 200, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") { depth++; started = true; }
          if (ch === "}") depth--;
        }
        if (started && depth === 0) { endLine = j; break; }
      }

      const bodyText = lines.slice(i, endLine + 1).join("\n");
      const paramMatch = line.match(/\(([^)]*)\)/);
      const params = paramMatch ? paramMatch[1].split(",").filter((p) => p.trim().length > 0).length : 0;

      funcs.push({
        name,
        line: i + 1,
        lines: endLine - i + 1,
        complexity: countComplexity(bodyText),
        params,
      });
      break;
    }
  }

  return funcs;
}

export async function code_metrics(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const root = (input["root"] as string) || process.cwd();

  if (!filePath) return "Error: path is required.";

  const absPath = filePath.startsWith("/") ? filePath : resolve(root, filePath);
  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (e) {
    return `Error reading file: ${String(e)}`;
  }

  const lines = content.split("\n");
  const nonBlank = lines.filter((l) => l.trim().length > 0);
  const comments = lines.filter((l) => {
    const t = l.trim();
    return t.startsWith("//") || t.startsWith("#") || t.startsWith("*") || t.startsWith("/*");
  });

  const ext = extname(absPath).toLowerCase();
  const funcs = extractFunctions(content, ext);

  // Sort by complexity desc
  const byComplexity = [...funcs].sort((a, b) => b.complexity - a.complexity);
  const byLength = [...funcs].sort((a, b) => b.lines - a.lines);

  const avgComplexity = funcs.length > 0
    ? (funcs.reduce((s, f) => s + f.complexity, 0) / funcs.length).toFixed(1)
    : "N/A";

  const highComplexity = byComplexity.filter((f) => f.complexity >= 10);
  const longFuncs = byLength.filter((f) => f.lines >= 50);

  const lines2: string[] = [
    `Code metrics: ${filePath}`,
    ``,
    `Total lines:    ${lines.length}`,
    `Non-blank:      ${nonBlank.length}`,
    `Comment lines:  ${comments.length} (${Math.round(comments.length / lines.length * 100)}%)`,
    `Functions:      ${funcs.length}`,
    `Avg complexity: ${avgComplexity}`,
    ``,
  ];

  if (byComplexity.slice(0, 10).length > 0) {
    lines2.push("Top 10 by complexity:");
    for (const f of byComplexity.slice(0, 10)) {
      const flag = f.complexity >= 15 ? " 🚨" : f.complexity >= 10 ? " ⚠️" : "";
      lines2.push(`  Line ${String(f.line).padStart(4)}: ${f.name.padEnd(30)} complexity=${f.complexity}, ${f.lines} lines, ${f.params} params${flag}`);
    }
    lines2.push("");
  }

  if (highComplexity.length > 0) {
    lines2.push(`⚠️  ${highComplexity.length} function(s) with complexity ≥10 (consider refactoring)`);
  }
  if (longFuncs.length > 0) {
    lines2.push(`⚠️  ${longFuncs.length} function(s) with ≥50 lines (consider splitting)`);
  }
  if (highComplexity.length === 0 && longFuncs.length === 0) {
    lines2.push("✅ No high-complexity or excessively long functions found.");
  }

  return lines2.join("\n");
}

export const def = {
  name: "code_metrics",
  description:
    "Measure code complexity metrics for a source file: total lines, comment ratio, function count, cyclomatic complexity per function, and flags functions that are too complex or too long.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the source file to analyze",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
