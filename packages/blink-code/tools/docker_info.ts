import { exec } from "node:child_process";

/** Interact with Docker: list containers, images, get status. */

export async function docker_info(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "status";
  const name = input["name"] as string | undefined;
  const all = input["all"] === true;

  return new Promise((resolve) => {
    let cmd = "";

    switch (action) {
      case "status":
        cmd = "docker info --format '{{.ServerVersion}}' 2>/dev/null && docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}' 2>&1 | head -30";
        break;
      case "containers":
        cmd = `docker ps${all ? " -a" : ""} --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.CreatedAt}}' 2>&1 | head -50`;
        break;
      case "images":
        cmd = "docker images --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}' 2>&1 | head -50";
        break;
      case "logs":
        if (!name) { resolve("Error: name is required for 'logs'."); return; }
        cmd = `docker logs --tail 50 ${name} 2>&1`;
        break;
      case "inspect":
        if (!name) { resolve("Error: name is required for 'inspect'."); return; }
        cmd = `docker inspect ${name} 2>&1 | head -100`;
        break;
      case "stop":
        if (!name) { resolve("Error: name is required for 'stop'."); return; }
        cmd = `docker stop ${name} 2>&1`;
        break;
      case "start":
        if (!name) { resolve("Error: name is required for 'start'."); return; }
        cmd = `docker start ${name} 2>&1`;
        break;
      case "stats":
        cmd = "docker stats --no-stream --format 'table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}\\t{{.BlockIO}}' 2>&1 | head -20";
        break;
      case "volumes":
        cmd = "docker volume ls 2>&1";
        break;
      case "networks":
        cmd = "docker network ls 2>&1";
        break;
      default:
        resolve(`Unknown action: ${action}. Use: status, containers, images, logs, inspect, stop, start, stats, volumes, networks`);
        return;
    }

    exec(cmd, { maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh", timeout: 15_000 }, (err, stdout, stderr) => {
      const out = stdout?.trim() || stderr?.trim();
      if (!out) {
        resolve(err ? `Docker error: ${String(err)}` : "Docker not available or no output.");
        return;
      }
      resolve(out);
    });
  });
}

export const def = {
  name: "docker_info",
  description:
    "Interact with Docker: check status, list running/all containers, list images, view container logs, inspect, start/stop containers, check resource stats, list volumes and networks.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "containers", "images", "logs", "inspect", "stop", "start", "stats", "volumes", "networks"],
        description: "Docker action (default: status)",
      },
      name: {
        type: "string",
        description: "Container name or ID (required for logs, inspect, stop, start)",
      },
      all: {
        type: "boolean",
        description: "Show all containers including stopped (for 'containers' action, default: false)",
      },
    },
    required: [],
  },
};
