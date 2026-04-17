/** Parse a cron expression and show the next N scheduled times. */

interface CronField {
  values: number[];
  step?: number;
}

function parseCronField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    const all: number[] = [];
    for (let i = min; i <= max; i++) all.push(i);
    return all;
  }

  const results = new Set<number>();

  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      const [start, end] = range === "*"
        ? [min, max]
        : range.split("-").map(Number);
      for (let i = (start ?? min); i <= (end ?? max); i += step) results.add(i);
    } else if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      for (let i = a; i <= b; i++) results.add(i);
    } else {
      results.add(parseInt(part, 10));
    }
  }

  return [...results].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return "Invalid cron expression";

  const [min, hour, dom, month, dow] = parts;

  const descriptions: string[] = [];

  if (min === "0" && hour === "0") descriptions.push("daily at midnight");
  else if (min === "0") descriptions.push(`at minute 0 of hour ${hour}`);
  else if (hour === "*") descriptions.push(`every minute ${min}`);
  else descriptions.push(`at ${hour}:${min.padStart(2, "0")}`);

  if (dom !== "*") descriptions.push(`on day ${dom} of the month`);
  if (month !== "*") {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthNames = month.split(",").map((m) => months[parseInt(m, 10) - 1] ?? m);
    descriptions.push(`in ${monthNames.join(", ")}`);
  }
  if (dow !== "*") {
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const dayNames = dow.split(",").map((d) => days[parseInt(d, 10)] ?? d);
    descriptions.push(`on ${dayNames.join(", ")}`);
  }

  return descriptions.join(" ");
}

function getNextRuns(expr: string, count = 5): Date[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return [];

  const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;

  const minutes = parseCronField(minExpr, 0, 59);
  const hours = parseCronField(hourExpr, 0, 23);
  const doms = parseCronField(domExpr, 1, 31);
  const months = parseCronField(monthExpr, 1, 12);
  const dows = domExpr !== "*" ? null : parseCronField(dowExpr, 0, 6);

  const results: Date[] = [];
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() + 1); // start from next minute

  const cursor = new Date(now);

  for (let iter = 0; iter < 1_000_000 && results.length < count; iter++) {
    if (months.includes(cursor.getMonth() + 1)) {
      const matchDay = dows
        ? dows.includes(cursor.getDay())
        : doms.includes(cursor.getDate());

      if (matchDay && hours.includes(cursor.getHours()) && minutes.includes(cursor.getMinutes())) {
        results.push(new Date(cursor));
      }
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
    if (cursor.getTime() - now.getTime() > 1000 * 60 * 60 * 24 * 366 * 2) break; // give up after 2 years
  }

  return results;
}

export async function cron_parse(input: Record<string, unknown>): Promise<string> {
  const expr = input["expression"] as string;
  const count = typeof input["count"] === "number" ? Math.min(input["count"], 20) : 5;

  if (!expr) return "Error: expression is required.";

  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) {
    return "Invalid cron expression — expected 5 fields: minute hour day-of-month month day-of-week";
  }

  const description = describeCron(expr);
  const nextRuns = getNextRuns(expr, count);

  const lines = [
    `Expression: ${expr}`,
    `Description: ${description}`,
    "",
    `Next ${count} scheduled runs:`,
    ...nextRuns.map((d, i) => `  ${i + 1}. ${d.toISOString().replace("T", " ").slice(0, 16)} UTC`),
  ];

  if (nextRuns.length < count) {
    lines.push(`\n(Could only find ${nextRuns.length} runs within the next 2 years)`);
  }

  return lines.join("\n");
}

export const def = {
  name: "cron_parse",
  description:
    "Parse a cron expression (5-field format) and show a human-readable description plus the next N scheduled run times.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Cron expression (5 fields: minute hour day-of-month month day-of-week). E.g. '0 9 * * 1' = every Monday at 9am",
      },
      count: {
        type: "number",
        description: "Number of upcoming runs to show (default: 5, max: 20)",
      },
    },
    required: ["expression"],
  },
};
