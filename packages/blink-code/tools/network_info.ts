import { exec } from "node:child_process";

/** Get network information: interfaces, open ports, DNS lookup, ping. */

export async function network_info(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "interfaces";
  const host = input["host"] as string | undefined;
  const port = input["port"] as number | undefined;

  return new Promise((resolve) => {
    let cmd = "";

    switch (action) {
      case "interfaces":
        cmd = "ifconfig 2>/dev/null || ip addr show 2>/dev/null | head -60";
        break;
      case "open_ports":
        cmd = "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | head -40 || ss -tlnp 2>/dev/null | head -40 || netstat -tlnp 2>/dev/null | head -40";
        break;
      case "dns":
        if (!host) { resolve("Error: host is required for 'dns'."); return; }
        cmd = `dig +short ${host} 2>/dev/null || nslookup ${host} 2>/dev/null | tail -n +4 || host ${host} 2>/dev/null`;
        break;
      case "ping":
        if (!host) { resolve("Error: host is required for 'ping'."); return; }
        cmd = `ping -c 4 -W 3 ${host} 2>&1`;
        break;
      case "traceroute":
        if (!host) { resolve("Error: host is required for 'traceroute'."); return; }
        cmd = `traceroute -m 15 -w 2 ${host} 2>&1 | head -25 || tracepath ${host} 2>&1 | head -25`;
        break;
      case "whois":
        if (!host) { resolve("Error: host is required for 'whois'."); return; }
        cmd = `whois ${host} 2>&1 | head -50`;
        break;
      case "curl_headers":
        if (!host) { resolve("Error: host (URL) is required for 'curl_headers'."); return; }
        cmd = `curl -sI --max-time 10 ${host} 2>&1 | head -30`;
        break;
      default:
        resolve(`Unknown action: ${action}. Use: interfaces, open_ports, dns, ping, traceroute, whois, curl_headers`);
        return;
    }

    exec(cmd, { maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh", timeout: 20_000 }, (err, stdout, stderr) => {
      const out = stdout?.trim() || stderr?.trim();
      if (!out) {
        resolve(err ? `Network error: ${String(err)}` : "No output.");
        return;
      }
      resolve(out.slice(0, 3000));
    });
  });
}

export const def = {
  name: "network_info",
  description:
    "Get network information: list interfaces, find open ports, DNS lookup, ping a host, traceroute, WHOIS lookup, or fetch HTTP headers from a URL.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["interfaces", "open_ports", "dns", "ping", "traceroute", "whois", "curl_headers"],
        description: "Action to perform (default: interfaces)",
      },
      host: {
        type: "string",
        description: "Hostname, IP, or URL (required for dns, ping, traceroute, whois, curl_headers)",
      },
    },
    required: [],
  },
};
