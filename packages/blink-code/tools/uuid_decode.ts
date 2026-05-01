/** Decode a UUID, revealing version, variant, and (for v1/v6/v7) timestamp. */

export async function uuid_decode(input: Record<string, unknown>): Promise<string> {
  const uuid = (input["uuid"] as string)?.trim();
  if (!uuid) return "Error: uuid is required.";

  const cleaned = uuid.toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(cleaned)) return "Invalid UUID format.";

  const versionNibble = parseInt(cleaned[12], 16);
  const variantNibble = parseInt(cleaned[16], 16);

  let variant: string;
  if ((variantNibble & 0xc) === 0x8) variant = "RFC 4122";
  else if ((variantNibble & 0xe) === 0xc) variant = "Microsoft (reserved)";
  else if ((variantNibble & 0x8) === 0x0) variant = "NCS (reserved, backwards-compat)";
  else variant = "future (reserved)";

  const lines: string[] = [
    `UUID:    ${uuid}`,
    `Hex:     ${cleaned}`,
    `Version: ${versionNibble}`,
    `Variant: ${variant}`,
  ];

  // v1: time-low (8) + time-mid (4) + time-high-and-version (4) — 60-bit timestamp in 100ns units since 1582-10-15
  if (versionNibble === 1) {
    const timeLow = parseInt(cleaned.slice(0, 8), 16);
    const timeMid = parseInt(cleaned.slice(8, 12), 16);
    const timeHi = parseInt(cleaned.slice(12, 16), 16) & 0x0fff;
    const ts100ns = BigInt(timeHi) * (1n << 48n) + BigInt(timeMid) * (1n << 32n) + BigInt(timeLow);
    // Convert from 100ns since 1582-10-15 to ms since 1970-01-01
    const epochOffset100ns = 122192928000000000n; // 100ns intervals between 1582-10-15 and 1970-01-01
    const msSinceEpoch = Number((ts100ns - epochOffset100ns) / 10000n);
    const date = new Date(msSinceEpoch);
    lines.push(`Time:    ${date.toISOString()}`);
    const node = cleaned.slice(20, 32);
    lines.push(`Node:    ${node.match(/.{2}/g)!.join(":")}`);
    const clockSeq = parseInt(cleaned.slice(16, 20), 16) & 0x3fff;
    lines.push(`ClockSeq: ${clockSeq}`);
  }

  // v7: 48-bit unix-ms timestamp + version + random
  if (versionNibble === 7) {
    const tsMs = parseInt(cleaned.slice(0, 12), 16);
    lines.push(`Time:    ${new Date(tsMs).toISOString()} (Unix ms ${tsMs})`);
  }

  // v4 has no embedded data
  if (versionNibble === 4) {
    lines.push(`(v4 = random)`);
  }

  return lines.join("\n");
}

export const def = {
  name: "uuid_decode",
  description:
    "Decode a UUID and report its version, variant, and embedded data. For v1, extracts the timestamp, MAC node, and clock sequence. For v7, extracts the Unix-ms timestamp.",
  parameters: {
    type: "object",
    properties: {
      uuid: {
        type: "string",
        description: "UUID to decode (with or without hyphens)",
      },
    },
    required: ["uuid"],
  },
};
