import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Lint a Markdown file for common issues. */

interface MarkdownIssue {
  line: number;
  issue: string;
  severity: "error" | "warning";
}

export async function markdown_lint(input: Record<string, unknown>): Promise<string> {
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
  const issues: MarkdownIssue[] = [];

  // Track heading levels for hierarchy check
  let prevHeadingLevel = 0;
  let inCodeBlock = false;
  let codeBlockFence = "";
  let lastBlankLine = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trimEnd();

    // Track code blocks (skip checks inside them)
    if (!inCodeBlock && (trimmed.startsWith("```") || trimmed.startsWith("~~~"))) {
      inCodeBlock = true;
      codeBlockFence = trimmed.slice(0, 3);
      lastBlankLine = false;
      continue;
    }
    if (inCodeBlock && trimmed.startsWith(codeBlockFence)) {
      inCodeBlock = false;
      lastBlankLine = false;
      continue;
    }
    if (inCodeBlock) continue;

    // Trailing whitespace (except blank lines)
    if (line !== trimmed && trimmed.length > 0) {
      issues.push({ line: lineNum, issue: "Trailing whitespace", severity: "warning" });
    }

    // Tabs (MD recommends spaces)
    if (line.includes("\t")) {
      issues.push({ line: lineNum, issue: "Contains tab character (use spaces)", severity: "warning" });
    }

    // Heading checks
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      // No space after #
      if (!trimmed.match(/^#+\s/)) {
        issues.push({ line: lineNum, issue: "Heading missing space after #", severity: "error" });
      }

      // Empty heading
      if (!text) {
        issues.push({ line: lineNum, issue: "Empty heading", severity: "error" });
      }

      // Heading jump (e.g., H1 → H3)
      if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
        issues.push({ line: lineNum, issue: `Heading level jump: H${prevHeadingLevel} → H${level} (skipped H${prevHeadingLevel + 1})`, severity: "warning" });
      }
      prevHeadingLevel = level;
    }

    // Bare URLs (not in link syntax or code)
    const bareUrl = trimmed.match(/(?<![`\[(])(https?:\/\/[^\s)\]`]+)/);
    if (bareUrl && !trimmed.startsWith("[") && !trimmed.includes("](")) {
      issues.push({ line: lineNum, issue: `Bare URL — consider [text](url) format`, severity: "warning" });
    }

    // Empty link text []()
    if (trimmed.match(/\[\s*\]\s*\(/)) {
      issues.push({ line: lineNum, issue: "Empty link text [](...)", severity: "error" });
    }

    // Empty image alt text ![]()
    if (trimmed.match(/!\[\s*\]\s*\(/)) {
      issues.push({ line: lineNum, issue: "Empty image alt text ![]()", severity: "warning" });
    }

    // Broken reference-style link syntax
    if (trimmed.match(/\[[^\]]+\]\s*\[\s*\]/)) {
      issues.push({ line: lineNum, issue: "Empty reference in link [text][]", severity: "error" });
    }

    // Lines longer than 120 chars (soft warning)
    if (trimmed.length > 120 && !trimmed.startsWith("|")) {
      issues.push({ line: lineNum, issue: `Long line (${trimmed.length} chars > 120)`, severity: "warning" });
    }

    // Multiple consecutive blank lines
    const isBlank = trimmed.length === 0;
    if (isBlank && lastBlankLine) {
      issues.push({ line: lineNum, issue: "Multiple consecutive blank lines", severity: "warning" });
    }
    lastBlankLine = isBlank;
  }

  if (inCodeBlock) {
    issues.push({ line: lines.length, issue: "Unclosed code block", severity: "error" });
  }

  if (issues.length === 0) {
    return `✅ No issues found in ${filePath} (${lines.length} lines checked).`;
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const format = (list: MarkdownIssue[], label: string) =>
    list.length > 0
      ? `${label} (${list.length}):\n${list.map((i) => `  Line ${i.line}: ${i.issue}`).join("\n")}`
      : null;

  return [
    `Markdown lint: ${filePath} (${lines.length} lines)`,
    format(errors, "\n❌ Errors"),
    format(warnings, "\n⚠️  Warnings"),
  ].filter(Boolean).join("\n");
}

export const def = {
  name: "markdown_lint",
  description:
    "Lint a Markdown file for common issues: trailing whitespace, heading hierarchy violations, empty links/images, bare URLs, tabs, long lines, unclosed code blocks, and multiple blank lines.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the Markdown file to lint",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
