import { exec } from "node:child_process";
import * as os from "node:os";

/** Get system information: OS, CPU, memory, disk usage. */

function formatBytes(bytes: number): string {
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export async function system_info(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "all";

  const platform = os.platform();
  const arch = os.arch();
  const hostname = os.hostname();
  const release = os.release();
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const uptime = os.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const sections: string[] = [];

  if (action === "all" || action === "os") {
    sections.push([
      "=== OS ===",
      `Platform:  ${platform} (${arch})`,
      `Hostname:  ${hostname}`,
      `Kernel:    ${release}`,
      `Uptime:    ${uptimeStr}`,
      `Node.js:   ${process.version}`,
    ].join("\n"));
  }

  if (action === "all" || action === "cpu") {
    const model = cpus[0]?.model.trim() ?? "Unknown";
    const cores = cpus.length;
    const loadAvg = os.loadavg().map((l) => l.toFixed(2)).join(", ");
    sections.push([
      "=== CPU ===",
      `Model:     ${model}`,
      `Cores:     ${cores}`,
      `Load avg:  ${loadAvg} (1m, 5m, 15m)`,
    ].join("\n"));
  }

  if (action === "all" || action === "memory") {
    sections.push([
      "=== Memory ===",
      `Total:     ${formatBytes(totalMem)}`,
      `Used:      ${formatBytes(usedMem)} (${Math.round(usedMem / totalMem * 100)}%)`,
      `Free:      ${formatBytes(freeMem)}`,
    ].join("\n"));
  }

  if (action === "all" || action === "disk") {
    await new Promise<void>((res) => {
      exec("df -h 2>/dev/null | head -15 || df -h / 2>/dev/null", { timeout: 5000, shell: "/bin/sh" }, (_, stdout) => {
        if (stdout?.trim()) sections.push(`=== Disk ===\n${stdout.trim()}`);
        res();
      });
    });
  }

  if (action === "all" || action === "env") {
    const path = process.env.PATH?.split(":").slice(0, 8).join("\n  ") ?? "";
    sections.push([
      "=== Environment ===",
      `Shell:     ${process.env.SHELL ?? "(unknown)"}`,
      `User:      ${process.env.USER ?? process.env.USERNAME ?? "(unknown)"}`,
      `Home:      ${os.homedir()}`,
      `CWD:       ${process.cwd()}`,
      `PATH (truncated):\n  ${path}`,
    ].join("\n"));
  }

  return sections.join("\n\n") || "No information available.";
}

export const def = {
  name: "system_info",
  description:
    "Get system information: OS details, CPU model/cores/load average, memory usage, disk usage, and environment info. Can also show individual sections.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["all", "os", "cpu", "memory", "disk", "env"],
        description: "Which info to show (default: all)",
      },
    },
    required: [],
  },
};
