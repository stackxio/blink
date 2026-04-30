import { exec } from "node:child_process";

/** Time a shell command across multiple runs and report stats. */

export async function bench_command(input: Record<string, unknown>): Promise<string> {
  const root = (input["root"] as string) || process.cwd();
  const command = input["command"] as string;
  const runs = Math.min(typeof input["runs"] === "number" ? input["runs"] : 5, 20);
  const warmup = input["warmup"] === true ? 1 : 0;

  if (!command) return "Error: command is required.";

  const times: number[] = [];
  let lastErr: string | null = null;

  const runOnce = (): Promise<number | null> =>
    new Promise((resolve) => {
      const start = Date.now();
      exec(command, { cwd: root, maxBuffer: 2 * 1024 * 1024, timeout: 60_000, shell: "/bin/sh" }, (err) => {
        const dur = Date.now() - start;
        if (err) {
          lastErr = String(err).slice(0, 200);
          resolve(null);
          return;
        }
        resolve(dur);
      });
    });

  // Warmup runs (results discarded)
  for (let i = 0; i < warmup; i++) await runOnce();

  for (let i = 0; i < runs; i++) {
    const t = await runOnce();
    if (t == null) return `Command failed on run ${i + 1}: ${lastErr ?? "unknown error"}`;
    times.push(t);
  }

  times.sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const median = times[Math.floor(times.length / 2)];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const stddev = Math.sqrt(
    times.reduce((s, t) => s + (t - mean) ** 2, 0) / times.length,
  );

  return [
    `Benchmarked: ${command}`,
    `Runs: ${runs}${warmup ? ` (+${warmup} warmup)` : ""}`,
    "",
    `  min:    ${min} ms`,
    `  median: ${median} ms`,
    `  mean:   ${mean.toFixed(1)} ms`,
    `  max:    ${max} ms`,
    `  stddev: ${stddev.toFixed(1)} ms`,
    "",
    `Raw: [${times.join(", ")}]`,
  ].join("\n");
}

export const def = {
  name: "bench_command",
  description:
    "Benchmark a shell command by running it multiple times and reporting min, median, mean, max, and stddev of execution time in milliseconds.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to benchmark",
      },
      runs: {
        type: "number",
        description: "Number of timed runs (default: 5, max: 20)",
      },
      warmup: {
        type: "boolean",
        description: "Do one warmup run before timing (default: false)",
      },
      root: {
        type: "string",
        description: "Working directory (default: current workspace)",
      },
    },
    required: ["command"],
  },
};
