/** Convert between Unix timestamps and human-readable dates, or get the current time. */

export async function timestamp(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "now";
  const value = input["value"] as string | number | undefined;
  const timezone = (input["timezone"] as string) || "UTC";

  try {
    if (action === "now") {
      const now = new Date();
      const unix = Math.floor(now.getTime() / 1000);
      return [
        `Unix timestamp: ${unix}`,
        `ISO 8601: ${now.toISOString()}`,
        `Local: ${now.toLocaleString("en-US", { timeZone: timezone })} (${timezone})`,
      ].join("\n");
    }

    if (action === "to_date") {
      if (value == null) return "Error: value is required for 'to_date'.";
      const ms = typeof value === "number"
        ? (value > 1e10 ? value : value * 1000)  // auto-detect ms vs s
        : parseInt(String(value), 10) * 1000;
      const d = new Date(ms);
      return [
        `ISO 8601: ${d.toISOString()}`,
        `Local: ${d.toLocaleString("en-US", { timeZone: timezone })} (${timezone})`,
        `Unix (s): ${Math.floor(ms / 1000)}`,
        `Unix (ms): ${ms}`,
      ].join("\n");
    }

    if (action === "to_unix") {
      if (value == null) return "Error: value is required for 'to_unix'.";
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return `Cannot parse date: ${value}`;
      return [
        `Unix (seconds): ${Math.floor(d.getTime() / 1000)}`,
        `Unix (milliseconds): ${d.getTime()}`,
        `ISO 8601: ${d.toISOString()}`,
      ].join("\n");
    }

    if (action === "diff") {
      if (!value || typeof value !== "string") return "Error: value must be 'date1,date2' for diff.";
      const [a, b] = String(value).split(",").map((s) => new Date(s.trim()));
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return "Cannot parse one or both dates.";
      const diffMs = Math.abs(b.getTime() - a.getTime());
      const days = Math.floor(diffMs / 86400000);
      const hours = Math.floor((diffMs % 86400000) / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      return `Difference: ${days}d ${hours}h ${mins}m (${diffMs}ms total)`;
    }

    return `Unknown action: ${action}. Use: now, to_date, to_unix, diff`;
  } catch (e) {
    return `Error: ${String(e)}`;
  }
}

export const def = {
  name: "timestamp",
  description:
    "Work with dates and timestamps: get the current time, convert Unix timestamps to readable dates, parse date strings to Unix timestamps, or calculate the difference between two dates.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["now", "to_date", "to_unix", "diff"],
        description: "Action: 'now' (current time), 'to_date' (unix→date), 'to_unix' (date→unix), 'diff' (date1,date2)",
      },
      value: {
        description: "Input value: Unix timestamp (number), date string, or 'date1,date2' for diff",
      },
      timezone: {
        type: "string",
        description: "IANA timezone name for local display (default: UTC). E.g. 'America/New_York'",
      },
    },
    required: [],
  },
};
