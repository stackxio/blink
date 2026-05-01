/** Estimate password strength using entropy and common-pattern checks. */

const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567890",
  "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
  "ashley", "bailey", "passw0rd", "shadow", "123123", "654321", "superman",
  "qazwsx", "michael", "football", "welcome", "jesus", "ninja", "mustang",
  "password1", "admin", "test", "qwerty123",
]);

export async function password_strength(input: Record<string, unknown>): Promise<string> {
  const password = input["password"] as string;
  if (!password) return "Error: password is required.";

  const len = password.length;
  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digits = /[0-9]/.test(password);
  const symbols = /[^a-zA-Z0-9]/.test(password);

  let charsetSize = 0;
  if (lower) charsetSize += 26;
  if (upper) charsetSize += 26;
  if (digits) charsetSize += 10;
  if (symbols) charsetSize += 32;

  const entropy = len * Math.log2(Math.max(charsetSize, 1));

  // Penalties
  const issues: string[] = [];
  if (len < 8) issues.push("too short (< 8 chars)");
  if (len < 12) issues.push("consider 12+ characters");
  if (!lower) issues.push("missing lowercase");
  if (!upper) issues.push("missing uppercase");
  if (!digits) issues.push("missing digits");
  if (!symbols) issues.push("missing symbols");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) issues.push("appears in common-password list");
  if (/(.)\1{2,}/.test(password)) issues.push("contains repeated characters (aaa, 111)");
  if (/^(\d+)$/.test(password)) issues.push("digits only");
  if (/^([a-zA-Z])\1+$/.test(password)) issues.push("single repeated letter");

  // Sequential checks
  const sequences = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm"];
  for (const seq of sequences) {
    for (let i = 0; i <= seq.length - 4; i++) {
      const chunk = seq.slice(i, i + 4);
      if (password.toLowerCase().includes(chunk)) {
        issues.push(`contains sequence "${chunk}"`);
        break;
      }
    }
  }

  // Score from entropy
  let rating: string;
  let score: number;
  if (entropy < 28) { rating = "Very Weak"; score = 1; }
  else if (entropy < 36) { rating = "Weak"; score = 2; }
  else if (entropy < 60) { rating = "Reasonable"; score = 3; }
  else if (entropy < 128) { rating = "Strong"; score = 4; }
  else { rating = "Very Strong"; score = 5; }

  if (issues.includes("appears in common-password list")) {
    rating = "Very Weak (compromised)";
    score = 0;
  }

  // Time to crack (very rough): assume 10^10 guesses/sec offline
  const guesses = Math.pow(2, entropy);
  const seconds = guesses / 1e10;
  const timeStr =
    seconds < 1 ? "< 1 second" :
    seconds < 60 ? `~${Math.round(seconds)} seconds` :
    seconds < 3600 ? `~${Math.round(seconds / 60)} minutes` :
    seconds < 86400 ? `~${Math.round(seconds / 3600)} hours` :
    seconds < 86400 * 365 ? `~${Math.round(seconds / 86400)} days` :
    seconds < 86400 * 365 * 1000 ? `~${Math.round(seconds / 86400 / 365)} years` :
    "centuries+";

  const lines = [
    `Strength: ${rating} (${score}/5)`,
    `Length: ${len} chars`,
    `Charset size: ${charsetSize}`,
    `Entropy: ${entropy.toFixed(1)} bits`,
    `Time to crack (offline, 10^10/sec): ${timeStr}`,
    "",
    `Composition: lower=${lower} upper=${upper} digits=${digits} symbols=${symbols}`,
  ];
  if (issues.length > 0) {
    lines.push("", "Issues:");
    issues.forEach((i) => lines.push(`  - ${i}`));
  } else {
    lines.push("", "✓ No issues detected.");
  }
  return lines.join("\n");
}

export const def = {
  name: "password_strength",
  description:
    "Estimate password strength via entropy calculation and common-pattern checks. Reports rating, entropy in bits, estimated crack time, and specific issues.",
  parameters: {
    type: "object",
    properties: {
      password: {
        type: "string",
        description: "Password to evaluate",
      },
    },
    required: ["password"],
  },
};
