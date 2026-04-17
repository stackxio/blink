/** Generate one or more UUIDs (v4). */

export async function generate_uuid(input: Record<string, unknown>): Promise<string> {
  const count = typeof input["count"] === "number" ? Math.min(Math.max(1, input["count"]), 100) : 1;
  const uuids: string[] = [];
  for (let i = 0; i < count; i++) {
    uuids.push(crypto.randomUUID());
  }
  return count === 1 ? uuids[0] : uuids.join("\n");
}

export const def = {
  name: "generate_uuid",
  description: "Generate one or more random UUID v4 strings.",
  parameters: {
    type: "object",
    properties: {
      count: {
        type: "number",
        description: "Number of UUIDs to generate (default: 1, max: 100)",
      },
    },
    required: [],
  },
};
