import { createHash } from "node:crypto";

/** Compute cryptographic hash of text. */

export async function hash(input: Record<string, unknown>): Promise<string> {
  const data = input["data"] as string;
  const algorithm = (input["algorithm"] as string) || "sha256";

  if (typeof data !== "string") return "Error: data is required.";

  const supported = ["md5", "sha1", "sha256", "sha512", "sha224", "sha384"];
  if (!supported.includes(algorithm.toLowerCase())) {
    return `Unsupported algorithm: ${algorithm}. Supported: ${supported.join(", ")}`;
  }

  try {
    const h = createHash(algorithm.toLowerCase()).update(data, "utf8").digest("hex");
    return `${algorithm.toUpperCase()}: ${h}`;
  } catch (e) {
    return `Error computing hash: ${String(e)}`;
  }
}

export const def = {
  name: "hash",
  description: "Compute a cryptographic hash (MD5, SHA1, SHA256, SHA512, etc.) of a string.",
  parameters: {
    type: "object",
    properties: {
      data: {
        type: "string",
        description: "The string to hash",
      },
      algorithm: {
        type: "string",
        description: "Hash algorithm: md5, sha1, sha256 (default), sha512, sha224, sha384",
      },
    },
    required: ["data"],
  },
};
