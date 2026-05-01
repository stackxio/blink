import { promises as dns } from "node:dns";

/** Look up DNS records for a hostname. */

export async function dns_lookup(input: Record<string, unknown>): Promise<string> {
  const host = input["host"] as string;
  const types = (input["types"] as string[]) || ["A", "AAAA", "MX", "TXT", "NS"];

  if (!host) return "Error: host is required.";

  const lines: string[] = [`DNS lookup for ${host}:`, ""];

  for (const t of types) {
    try {
      let result: unknown;
      switch (t) {
        case "A":
          result = await dns.resolve4(host);
          break;
        case "AAAA":
          result = await dns.resolve6(host);
          break;
        case "MX":
          result = await dns.resolveMx(host);
          break;
        case "TXT":
          result = await dns.resolveTxt(host);
          break;
        case "NS":
          result = await dns.resolveNs(host);
          break;
        case "CNAME":
          result = await dns.resolveCname(host);
          break;
        case "SOA":
          result = await dns.resolveSoa(host);
          break;
        default:
          continue;
      }
      lines.push(`${t}:`);
      if (Array.isArray(result)) {
        for (const r of result) lines.push(`  ${typeof r === "object" ? JSON.stringify(r) : r}`);
      } else {
        lines.push(`  ${JSON.stringify(result)}`);
      }
      lines.push("");
    } catch (e) {
      const msg = String(e).match(/ENOTFOUND|ENODATA|ESERVFAIL/) ? (String(e).match(/E\w+/)?.[0] ?? "no records") : String(e).slice(0, 100);
      lines.push(`${t}: ${msg}`, "");
    }
  }

  return lines.join("\n").trim();
}

export const def = {
  name: "dns_lookup",
  description:
    "Look up DNS records (A, AAAA, MX, TXT, NS, CNAME, SOA) for a hostname. Specify which types to query.",
  parameters: {
    type: "object",
    properties: {
      host: {
        type: "string",
        description: "Hostname to look up",
      },
      types: {
        type: "array",
        items: { type: "string", enum: ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"] },
        description: "Record types to query (default: ['A', 'AAAA', 'MX', 'TXT', 'NS'])",
      },
    },
    required: ["host"],
  },
};
