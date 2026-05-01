/** Convert a timestamp between time zones. */

export async function timezone_convert(input: Record<string, unknown>): Promise<string> {
  const value = (input["value"] as string) || new Date().toISOString();
  const fromTz = (input["from"] as string) || "UTC";
  const toTz = input["to"] as string;
  const list = (input["list"] as string[]) || (toTz ? [toTz] : ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"]);

  let date: Date;
  try {
    date = new Date(value);
    if (isNaN(date.getTime())) throw new Error("invalid date");
  } catch (e) {
    return `Invalid timestamp: ${String(e)}`;
  }

  const lines = [`Timestamp: ${date.toISOString()} (UTC)`, `Original input: ${value}`, ""];

  for (const tz of list) {
    try {
      const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }).format(date);
      lines.push(`  ${tz.padEnd(24)} ${formatted}`);
    } catch (e) {
      lines.push(`  ${tz.padEnd(24)} (invalid timezone)`);
    }
  }

  return lines.join("\n");
}

export const def = {
  name: "timezone_convert",
  description:
    "Convert a timestamp to multiple time zones. Default list covers major regions (UTC, NYC, LA, London, Berlin, Tokyo, Singapore, Sydney). Pass a specific 'to' or 'list' for custom zones.",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "ISO timestamp or date string (default: now)",
      },
      from: {
        type: "string",
        description: "Source time zone (default: UTC) — currently informational only",
      },
      to: {
        type: "string",
        description: "Single target timezone (IANA name)",
      },
      list: {
        type: "array",
        items: { type: "string" },
        description: "List of target time zones (overrides default world set)",
      },
    },
    required: [],
  },
};
