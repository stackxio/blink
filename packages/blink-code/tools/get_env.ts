import * as fs from "node:fs/promises";
import * as path from "node:path";

const SENSITIVE_KEYS = /key|secret|password|token|auth|credential|private|api/i;

export async function get_env(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const envFile = input["file"] as string | undefined;

  // Try files in order: provided file, .env.local, .env
  const candidates = envFile
    ? [path.isAbsolute(envFile) ? envFile : path.join(root, envFile)]
    : [
        path.join(root, ".env.local"),
        path.join(root, ".env"),
        path.join(root, ".env.development"),
      ];

  let content = "";
  let foundFile = "";
  for (const candidate of candidates) {
    try {
      content = await fs.readFile(candidate, "utf-8");
      foundFile = candidate;
      break;
    } catch {}
  }

  if (!content) {
    return `No .env file found in ${root}. Tried: ${candidates.join(", ")}`;
  }

  const lines = content.split("\n");
  const result: string[] = [`File: ${foundFile}`, ""];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      result.push(line); // pass through comments and blank lines
      continue;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) {
      result.push(line);
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    // Redact sensitive values
    const redacted = SENSITIVE_KEYS.test(key) ? "****" : value;
    result.push(`${key}=${redacted}`);
  }

  return result.join("\n");
}

export const def = {
  name: "get_env",
  description:
    "Read environment variables from .env files in the project root. Automatically redacts values for keys that look sensitive (containing 'key', 'secret', 'password', 'token', etc.).",
  parameters: {
    type: "object",
    properties: {
      root: {
        type: "string",
        description: "Root directory to look for .env files (default: current workspace)",
      },
      file: {
        type: "string",
        description: "Specific .env filename to read (e.g. '.env.production'). If omitted, tries .env.local then .env.",
      },
    },
    required: [],
  },
};
