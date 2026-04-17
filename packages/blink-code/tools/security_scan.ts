import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Scan code for common security issues: hardcoded secrets, SQL injection patterns, eval usage, etc. */

interface SecurityIssue {
  line: number;
  issue: string;
  severity: "critical" | "high" | "medium" | "low";
  snippet: string;
}

const PATTERNS: Array<{ pattern: RegExp; issue: string; severity: SecurityIssue["severity"] }> = [
  // Hardcoded credentials
  { pattern: /(?:password|passwd|pwd)\s*=\s*["'][^"']{3,}["']/i, issue: "Hardcoded password", severity: "critical" },
  { pattern: /(?:api_key|apikey|api-key)\s*[=:]\s*["'][a-zA-Z0-9_\-]{10,}["']/i, issue: "Hardcoded API key", severity: "critical" },
  { pattern: /(?:secret|token)\s*[=:]\s*["'][a-zA-Z0-9_\-]{10,}["']/i, issue: "Hardcoded secret/token", severity: "critical" },
  { pattern: /BEGIN\s+(?:RSA|EC|OPENSSH|DSA)\s+PRIVATE\s+KEY/i, issue: "Private key in source code", severity: "critical" },
  { pattern: /AKIA[0-9A-Z]{16}/, issue: "AWS Access Key ID", severity: "critical" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, issue: "GitHub Personal Access Token", severity: "critical" },
  { pattern: /sk-[a-zA-Z0-9]{20,}/, issue: "Possible OpenAI API key", severity: "critical" },

  // Dangerous functions
  { pattern: /\beval\s*\(/, issue: "eval() usage — potential code injection", severity: "high" },
  { pattern: /\bnew\s+Function\s*\(/, issue: "new Function() — potential code injection", severity: "high" },
  { pattern: /\bexec\s*\(\s*[^'"]\s*\+/, issue: "exec() with string concatenation — potential command injection", severity: "high" },
  { pattern: /innerHTML\s*=(?!=)/, issue: "innerHTML assignment — potential XSS", severity: "high" },
  { pattern: /document\.write\s*\(/, issue: "document.write() — potential XSS", severity: "high" },
  { pattern: /dangerouslySetInnerHTML/i, issue: "dangerouslySetInnerHTML — ensure content is sanitized", severity: "medium" },

  // SQL injection
  { pattern: /["']\s*\+\s*\w+\s*\+\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i, issue: "Possible SQL injection via string concatenation", severity: "high" },
  { pattern: /\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i, issue: "Possible SQL injection via template literal", severity: "high" },

  // Crypto weaknesses
  { pattern: /\bMD5\b/i, issue: "MD5 is cryptographically broken (use SHA-256+)", severity: "medium" },
  { pattern: /\bSHA1\b|createHash\s*\(\s*['"]sha1['"]\s*\)/i, issue: "SHA-1 is weak for security use (use SHA-256+)", severity: "medium" },
  { pattern: /Math\.random\s*\(\s*\)/i, issue: "Math.random() is not cryptographically secure", severity: "low" },

  // Path traversal
  { pattern: /\.\.\//g, issue: "Possible path traversal pattern (../)", severity: "medium" },

  // Misc
  { pattern: /\bconsole\.(log|debug|info)\s*\(.*(?:password|token|secret|key|auth)/i, issue: "Logging sensitive data", severity: "medium" },
  { pattern: /localhost|127\.0\.0\.1/i, issue: "Hardcoded localhost URL (may break in production)", severity: "low" },
  { pattern: /\/\*\s*TODO.*(?:security|hack|fixme|temp)/i, issue: "Security TODO comment", severity: "low" },
];

export async function security_scan(input: Record<string, unknown>): Promise<string> {
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
  const issues: SecurityIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines for most patterns
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) continue;

    for (const check of PATTERNS) {
      if (check.pattern.test(line)) {
        issues.push({
          line: i + 1,
          issue: check.issue,
          severity: check.severity,
          snippet: line.trim().slice(0, 100),
        });
        break; // one issue per line per pass
      }
    }
  }

  if (issues.length === 0) {
    return `✅ No common security issues found in ${filePath} (${lines.length} lines scanned)`;
  }

  const bySeverity = {
    critical: issues.filter((i) => i.severity === "critical"),
    high: issues.filter((i) => i.severity === "high"),
    medium: issues.filter((i) => i.severity === "medium"),
    low: issues.filter((i) => i.severity === "low"),
  };

  const formatGroup = (list: SecurityIssue[], label: string) =>
    list.length > 0
      ? `${label} (${list.length}):\n${list.map((i) => `  Line ${i.line}: ${i.issue}\n    ${i.snippet}`).join("\n")}`
      : null;

  return [
    `Security scan: ${filePath} (${lines.length} lines)`,
    `Summary: ${bySeverity.critical.length} critical, ${bySeverity.high.length} high, ${bySeverity.medium.length} medium, ${bySeverity.low.length} low`,
    formatGroup(bySeverity.critical, "\n🚨 CRITICAL"),
    formatGroup(bySeverity.high, "\n❌ HIGH"),
    formatGroup(bySeverity.medium, "\n⚠️  MEDIUM"),
    formatGroup(bySeverity.low, "\n📝 LOW"),
  ].filter(Boolean).join("\n");
}

export const def = {
  name: "security_scan",
  description:
    "Scan a source file for common security issues: hardcoded credentials, API keys, eval/innerHTML/dangerouslySetInnerHTML usage, SQL injection patterns, weak crypto (MD5/SHA1), path traversal, and more.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to scan",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path"],
  },
};
