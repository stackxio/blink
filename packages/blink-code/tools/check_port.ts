import { exec } from "node:child_process";

export async function check_port(input: Record<string, unknown>): Promise<string> {
  const port = input["port"] as number;

  if (!port || typeof port !== "number") {
    return "Please provide a port number.";
  }

  return new Promise((resolve) => {
    // macOS/Linux: lsof to find what's using the port
    exec(`lsof -i :${port} -sTCP:LISTEN -n -P 2>/dev/null || ss -tlnp "sport = :${port}" 2>/dev/null`, (err, stdout) => {
      if (stdout && stdout.trim()) {
        resolve(`Port ${port} is IN USE:\n${stdout.trim()}`);
        return;
      }
      // Also try netstat as last fallback
      exec(`netstat -an 2>/dev/null | grep ":${port} "`, (_e2, stdout2) => {
        if (stdout2 && stdout2.trim()) {
          const lines = stdout2.trim().split("\n").filter(l => l.includes("LISTEN") || l.includes(`*.${port}`));
          if (lines.length > 0) {
            resolve(`Port ${port} is IN USE:\n${lines.join("\n")}`);
            return;
          }
        }
        resolve(`Port ${port} is FREE (not in use).`);
      });
    });
  });
}

export const def = {
  name: "check_port",
  description:
    "Check whether a TCP port is in use or free. Returns what process is listening on the port if it's in use.",
  parameters: {
    type: "object",
    properties: {
      port: {
        type: "number",
        description: "The port number to check (e.g. 3000, 8080)",
      },
    },
    required: ["port"],
  },
};
