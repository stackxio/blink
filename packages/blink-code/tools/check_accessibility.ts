import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Basic accessibility checks for HTML or JSX/TSX files. */

interface A11yIssue {
  line: number;
  issue: string;
  severity: "error" | "warning";
  snippet: string;
}

export async function check_accessibility(input: Record<string, unknown>): Promise<string> {
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
  const issues: A11yIssue[] = [];

  const checks: Array<{
    pattern: RegExp;
    issue: string;
    severity: "error" | "warning";
    skip?: RegExp;
  }> = [
    {
      pattern: /<img(?![^>]*alt=)/i,
      issue: "<img> missing alt attribute",
      severity: "error",
    },
    {
      pattern: /<img[^>]*alt\s*=\s*["']\s*["']/i,
      issue: "<img> has empty alt attribute (acceptable for decorative images, but verify)",
      severity: "warning",
    },
    {
      pattern: /<(button|a)[^>]*>\s*(<img[^>]*>)\s*<\/(button|a)>/i,
      issue: "Interactive element wrapping only an image should have aria-label",
      severity: "warning",
    },
    {
      pattern: /<input(?![^>]*(aria-label|id=|title=))/i,
      issue: "<input> missing aria-label, id, or title (may lack accessible label)",
      severity: "warning",
    },
    {
      pattern: /onclick\s*=/i,
      issue: "onclick attribute on non-interactive element (prefer button/a)",
      severity: "warning",
    },
    {
      pattern: /<(div|span)[^>]*onclick/i,
      issue: "<div>/<span> with onClick should be a <button> or have role and keyboard handler",
      severity: "error",
    },
    {
      pattern: /tabindex\s*=\s*["']?-?\d{2,}/i,
      issue: "tabIndex value unusual — should be 0 or -1",
      severity: "warning",
    },
    {
      pattern: /<(h[1-6])[^>]*>\s*<\/(h[1-6])>/i,
      issue: "Empty heading element",
      severity: "error",
    },
    {
      pattern: /aria-hidden\s*=\s*["']true["'][^>]*>([\s\S]*?)<\/(?:button|a|input)/i,
      issue: "aria-hidden=true on focusable element hides it from screen readers",
      severity: "error",
    },
    {
      pattern: /<(button|a)[^>]*>\s*<\/(button|a)>/i,
      issue: "Empty interactive element has no accessible text",
      severity: "error",
    },
    {
      pattern: /color\s*:\s*(?:red|green|blue|yellow)(?!\s*;?\s*\/\*\s*a11y)/i,
      issue: "Color-only meaning should have a non-color indicator too",
      severity: "warning",
    },
    {
      pattern: /<marquee|<blink/i,
      issue: "Deprecated HTML element causes accessibility issues",
      severity: "error",
    },
    {
      pattern: /autoplay(?!\s*=\s*["']false["'])/i,
      issue: "autoplay can cause issues for users with cognitive disabilities",
      severity: "warning",
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const check of checks) {
      if (check.pattern.test(line)) {
        issues.push({
          line: i + 1,
          issue: check.issue,
          severity: check.severity,
          snippet: line.trim().slice(0, 80),
        });
      }
    }
  }

  if (issues.length === 0) {
    return `✅ No obvious accessibility issues found in ${filePath} (${lines.length} lines checked)`;
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const format = (list: A11yIssue[], label: string) =>
    list.length > 0
      ? `${label} (${list.length}):\n${list.map((i) => `  Line ${i.line}: ${i.issue}\n    ${i.snippet}`).join("\n")}`
      : null;

  return [
    `Accessibility check: ${filePath}`,
    format(errors, "❌ Errors"),
    format(warnings, "⚠️  Warnings"),
  ].filter(Boolean).join("\n\n");
}

export const def = {
  name: "check_accessibility",
  description:
    "Run basic accessibility (a11y) checks on an HTML, JSX, or TSX file. Detects missing alt text, empty interactive elements, divs with onClick, aria-hidden on focusable elements, and more.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the HTML/JSX/TSX file to check",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
