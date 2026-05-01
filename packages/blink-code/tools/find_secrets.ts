import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Scan files for likely secrets (API keys, tokens, private keys). */

const PATTERNS: Array<[RegExp, string]> = [
  [/AKIA[0-9A-Z]{16}/, "AWS Access Key"],
  [/aws_secret_access_key\s*=\s*['"]?([A-Za-z0-9\/+=]{40})['"]?/i, "AWS Secret Key"],
  [/AIza[0-9A-Za-z\-_]{35}/, "Google API Key"],
  [/ya29\.[0-9A-Za-z\-_]+/, "Google OAuth Token"],
  [/sk-[a-zA-Z0-9]{20,}/, "OpenAI/Anthropic API Key"],
  [/sk-ant-[a-zA-Z0-9\-_]{20,}/, "Anthropic API Key"],
  [/ghp_[a-zA-Z0-9]{36}/, "GitHub Personal Access Token"],
  [/gho_[a-zA-Z0-9]{36}/, "GitHub OAuth Token"],
  [/github_pat_[a-zA-Z0-9_]{82}/, "GitHub Fine-grained PAT"],
  [/glpat-[a-zA-Z0-9\-_]{20}/, "GitLab Personal Access Token"],
  [/xox[abpr]-[0-9a-zA-Z\-]{10,}/, "Slack Token"],
  [/(?:r|s)k_(?:test|live)_[0-9a-zA-Z]{24,}/, "Stripe API Key"],
  [/-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/, "Private Key"],
  [/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_\-]+/, "JWT Token"],
  [/(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, "Hardcoded password"],
  [/(?:secret|api_key|apikey|access_token|auth_token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i, "API/secret token"],
];

export async function find_secrets(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const absRoot = root.startsWith("/") ? root : resolve(process.cwd(), root);

  return new Promise((resolve_fn) => {
    exec(
      `git ls-files 2>/dev/null | grep -v 'node_modules\\|.lock$\\|.min.js$\\|.svg$\\|.png$\\|.jpg$\\|.gif$\\|.pdf$\\|dist/\\|build/' | head -500`,
      { cwd: absRoot, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh" },
      async (_, stdout) => {
        const files = stdout.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          resolve_fn("No files to scan.");
          return;
        }

        const findings: { file: string; line: number; type: string; match: string }[] = [];

        for (const file of files) {
          try {
            const content = await readFile(resolve(absRoot, file), "utf8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              for (const [pattern, kind] of PATTERNS) {
                const m = line.match(pattern);
                if (m) {
                  const matched = m[0].slice(0, 80);
                  findings.push({
                    file,
                    line: i + 1,
                    type: kind,
                    match: matched.length > 30 ? matched.slice(0, 12) + "…" + matched.slice(-8) : matched,
                  });
                }
              }
            }
          } catch { /* skip */ }
        }

        if (findings.length === 0) {
          resolve_fn("✓ No secrets detected.");
          return;
        }

        const lines = [`⚠ Found ${findings.length} potential secret(s):`, ""];
        for (const f of findings.slice(0, 100)) {
          lines.push(`  ${f.file}:${f.line}  [${f.type}]  ${f.match}`);
        }
        if (findings.length > 100) lines.push(`  ... and ${findings.length - 100} more`);
        resolve_fn(lines.join("\n"));
      },
    );
  });
}

export const def = {
  name: "find_secrets",
  description:
    "Scan tracked files for likely secrets: AWS keys, GitHub tokens, GitLab tokens, OAuth tokens, API keys (OpenAI, Anthropic, Google, Stripe), JWTs, private keys, hardcoded passwords. Reports file:line and the match.",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory of the repo (default: current workspace)",
      },
    },
    required: [],
  },
};
