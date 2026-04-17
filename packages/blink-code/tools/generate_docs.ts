import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

/** Generate JSDoc/docstring comments for functions that are missing them. */

interface FunctionInfo {
  line: number;
  name: string;
  params: string[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
}

function parseParamList(raw: string): string[] {
  return raw
    .split(",")
    .map((p) => p.trim().replace(/:\s*.+$/, "").replace(/[=].*$/, "").replace(/[?!]$/, "").trim())
    .filter((p) => p.length > 0 && !p.startsWith("{") && !p.startsWith("["));
}

function extractFunctions(content: string, ext: string): FunctionInfo[] {
  const lines = content.split("\n");
  const funcs: FunctionInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines that already have JSDoc above them
    if (i > 0 && lines[i - 1].trim().endsWith("*/")) continue;
    if (i > 0 && (lines[i - 1].trim().startsWith("//") || lines[i - 1].trim().startsWith("*"))) continue;

    // TypeScript/JavaScript function patterns
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      // function declaration
      const fm = line.match(/^(export\s+)?(?:(async)\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([\w<>[\], |]+))?/);
      if (fm) {
        funcs.push({
          line: i + 1,
          name: fm[3],
          params: parseParamList(fm[4]),
          returnType: fm[5]?.trim(),
          isAsync: !!fm[2],
          isExported: !!fm[1],
        });
        continue;
      }

      // const/let arrow function
      const am = line.match(/^(export\s+)?(?:const|let)\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)(?:\s*:\s*([\w<>[\], |]+))?\s*=>/);
      if (am) {
        funcs.push({
          line: i + 1,
          name: am[2],
          params: parseParamList(am[4]),
          returnType: am[5]?.trim(),
          isAsync: !!am[3],
          isExported: !!am[1],
        });
        continue;
      }
    }

    // Python def
    if (ext === ".py") {
      const pm = line.match(/^(\s*)def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([\w[\], |]+))?/);
      if (pm) {
        const params = parseParamList(pm[3]).filter((p) => p !== "self" && p !== "cls");
        funcs.push({ line: i + 1, name: pm[2], params, returnType: pm[4], isAsync: false, isExported: !pm[2].startsWith("_") });
        continue;
      }
    }
  }

  return funcs;
}

function generateJSDoc(fn: FunctionInfo): string {
  const lines = ["/**", ` * ${fn.name} - TODO: describe what this function does.`];
  if (fn.isAsync) lines.push(" *", " * @async");
  if (fn.params.length > 0) {
    lines.push(" *");
    for (const p of fn.params) {
      lines.push(` * @param {*} ${p} - TODO: describe ${p}`);
    }
  }
  if (fn.returnType && fn.returnType !== "void") {
    lines.push(" *", ` * @returns {${fn.returnType}} - TODO: describe return value`);
  }
  lines.push(" */");
  return lines.join("\n");
}

function generatePyDoc(fn: FunctionInfo): string {
  const lines = ['    """', `    ${fn.name} - TODO: describe what this function does.`];
  if (fn.params.length > 0) {
    lines.push("", "    Args:");
    for (const p of fn.params) {
      lines.push(`        ${p}: TODO: describe ${p}`);
    }
  }
  if (fn.returnType) {
    lines.push("", "    Returns:", `        TODO: describe return value`);
  }
  lines.push('    """');
  return lines.join("\n");
}

export async function generate_docs(input: Record<string, unknown>): Promise<string> {
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

  const ext = extname(absPath).toLowerCase();
  const funcs = extractFunctions(content, ext);

  if (funcs.length === 0) {
    return `No undocumented functions found in ${filePath}.`;
  }

  const lines = [`Found ${funcs.length} function(s) needing documentation in ${filePath}:\n`];

  for (const fn of funcs.slice(0, 20)) {
    const doc = ext === ".py" ? generatePyDoc(fn) : generateJSDoc(fn);
    lines.push(`--- Line ${fn.line}: ${fn.name}(${fn.params.join(", ")}) ---`);
    lines.push(doc);
    lines.push("");
  }

  if (funcs.length > 20) lines.push(`... and ${funcs.length - 20} more functions`);

  return lines.join("\n");
}

export const def = {
  name: "generate_docs",
  description:
    "Find undocumented functions/methods in a TypeScript, JavaScript, or Python file and generate template JSDoc or docstring comments for them.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the source file to generate docs for",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
