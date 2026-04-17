import { exec } from "node:child_process";

/** List running processes, find processes by name, or kill a process. */

export async function list_processes(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "list";
  const name = input["name"] as string | undefined;
  const pid = input["pid"] as number | undefined;

  return new Promise((resolve) => {
    let cmd = "";

    switch (action) {
      case "list":
        cmd = "ps aux --sort=-%cpu 2>/dev/null | head -30 || ps aux | head -30";
        break;
      case "top_cpu":
        cmd = "ps aux --sort=-%cpu 2>/dev/null | head -15 || ps -eo pid,comm,%cpu,%mem | sort -k3 -rn | head -15";
        break;
      case "top_mem":
        cmd = "ps aux --sort=-%mem 2>/dev/null | head -15 || ps -eo pid,comm,%cpu,%mem | sort -k4 -rn | head -15";
        break;
      case "find":
        if (!name) { resolve("Error: name is required for 'find'."); return; }
        cmd = `ps aux | grep -i ${JSON.stringify(name)} | grep -v grep`;
        break;
      case "kill":
        if (!pid) { resolve("Error: pid is required for 'kill'."); return; }
        cmd = `kill ${pid}`;
        break;
      case "kill_name":
        if (!name) { resolve("Error: name is required for 'kill_name'."); return; }
        cmd = `pkill -f ${JSON.stringify(name)}`;
        break;
      default:
        resolve(`Unknown action: ${action}. Use: list, top_cpu, top_mem, find, kill, kill_name`);
        return;
    }

    exec(cmd, { maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh", timeout: 10_000 }, (err, stdout, stderr) => {
      const out = stdout?.trim() || stderr?.trim();
      if (!out && err) {
        resolve(`Process error: ${String(err)}`);
        return;
      }
      resolve(out || (action.startsWith("kill") ? "Signal sent." : "No processes found."));
    });
  });
}

export const def = {
  name: "list_processes",
  description:
    "List running processes, find processes by name, show top CPU/memory consumers, or kill a process by PID or name.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "top_cpu", "top_mem", "find", "kill", "kill_name"],
        description: "Action: list all, top_cpu, top_mem, find by name, kill by PID, kill_name by name (default: list)",
      },
      name: {
        type: "string",
        description: "Process name to find or kill (required for find, kill_name)",
      },
      pid: {
        type: "number",
        description: "Process ID to kill (required for kill)",
      },
    },
    required: [],
  },
};
