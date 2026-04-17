import { exec } from "node:child_process";

/** Run a command and measure its execution time, or benchmark a code snippet. */

export async function measure_performance(input: Record<string, unknown>): Promise<string> {
  const command = input["command"] as string;
  const root = (input["root"] as string) || process.cwd();
  const runs = typeof input["runs"] === "number" ? Math.min(Math.max(1, input["runs"]), 10) : 1;

  if (!command) return "Error: command is required.";

  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await new Promise<void>((resolve) => {
      exec(command, { cwd: root, maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }, () => {
        times.push(performance.now() - start);
        resolve();
      });
    });
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  const lines = [`Command: ${command}`, `Runs: ${runs}`];

  if (runs === 1) {
    lines.push(`Time: ${avg.toFixed(1)}ms`);
  } else {
    lines.push(
      `Average: ${avg.toFixed(1)}ms`,
      `Min: ${min.toFixed(1)}ms`,
      `Max: ${max.toFixed(1)}ms`,
      `All runs: ${times.map((t) => t.toFixed(1) + "ms").join(", ")}`,
    );
  }

  return lines.join("\n");
}

export const def = {
  name: "measure_performance",
  description:
    "Measure the execution time of a shell command. Optionally run it multiple times to get average/min/max. Useful for benchmarking build steps, test suites, or scripts.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to time (e.g. 'npm run build', 'cargo build')",
      },
      runs: {
        type: "number",
        description: "Number of times to run the command (default: 1, max: 10)",
      },
      root: {
        type: "string",
        description: "Working directory for the command (default: current workspace)",
      },
    },
    required: ["command"],
  },
};
