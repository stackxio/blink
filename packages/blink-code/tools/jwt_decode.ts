/** Decode and inspect a JWT token (without verifying the signature). */

export async function jwt_decode(input: Record<string, unknown>): Promise<string> {
  const token = (input["token"] as string)?.trim();

  if (!token) return "Error: token is required.";

  const parts = token.split(".");
  if (parts.length !== 3) {
    return `Invalid JWT format: expected 3 parts separated by '.', got ${parts.length}.`;
  }

  function base64urlDecode(str: string): string {
    // Pad to multiple of 4
    const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return "(binary data)";
    }
  }

  let header: Record<string, unknown> = {};
  let payload: Record<string, unknown> = {};

  try {
    header = JSON.parse(base64urlDecode(parts[0]));
  } catch {
    return "Failed to decode JWT header.";
  }

  try {
    payload = JSON.parse(base64urlDecode(parts[1]));
  } catch {
    return "Failed to decode JWT payload.";
  }

  const lines: string[] = [
    "=== JWT Header ===",
    JSON.stringify(header, null, 2),
    "",
    "=== JWT Payload ===",
    JSON.stringify(payload, null, 2),
    "",
    "=== Signature ===",
    `(not verified) length: ${parts[2].length} chars`,
  ];

  // Parse well-known claims
  const notes: string[] = [];
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp === "number") {
    const expDate = new Date(payload.exp * 1000).toISOString();
    const expired = payload.exp < now;
    notes.push(`exp (expires): ${expDate} — ${expired ? "⚠️  EXPIRED" : "✅ valid"}`);
  }
  if (typeof payload.iat === "number") {
    notes.push(`iat (issued at): ${new Date(payload.iat * 1000).toISOString()}`);
  }
  if (typeof payload.nbf === "number") {
    const notYet = payload.nbf > now;
    notes.push(`nbf (not before): ${new Date(payload.nbf * 1000).toISOString()}${notYet ? " — ⚠️  not yet valid" : ""}`);
  }
  if (payload.sub) notes.push(`sub (subject): ${payload.sub}`);
  if (payload.iss) notes.push(`iss (issuer): ${payload.iss}`);
  if (payload.aud) notes.push(`aud (audience): ${Array.isArray(payload.aud) ? payload.aud.join(", ") : payload.aud}`);

  if (notes.length > 0) {
    lines.push("", "=== Claims Summary ===", ...notes);
  }

  lines.push(
    "",
    "⚠️  Note: signature is NOT verified — do not trust this token based on decode alone.",
  );

  return lines.join("\n");
}

export const def = {
  name: "jwt_decode",
  description:
    "Decode a JWT token and display its header, payload claims, and expiry information. Does NOT verify the signature — useful for inspection and debugging only.",
  parameters: {
    type: "object",
    properties: {
      token: {
        type: "string",
        description: "The JWT token string to decode",
      },
    },
    required: ["token"],
  },
};
