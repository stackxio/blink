/** Encode or decode Base64 strings. */

export async function base64(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "encode";
  const data = input["data"] as string;

  if (typeof data !== "string") return "Error: data is required.";

  try {
    if (action === "encode") {
      const encoded = Buffer.from(data, "utf8").toString("base64");
      return `Base64 encoded:\n${encoded}`;
    } else if (action === "decode") {
      const decoded = Buffer.from(data, "base64").toString("utf8");
      return `Base64 decoded:\n${decoded}`;
    } else {
      return `Unknown action: ${action}. Use 'encode' or 'decode'.`;
    }
  } catch (e) {
    return `Error: ${String(e)}`;
  }
}

export const def = {
  name: "base64",
  description: "Encode text to Base64 or decode a Base64 string back to text.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["encode", "decode"],
        description: "Whether to encode or decode (default: encode)",
      },
      data: {
        type: "string",
        description: "The string to encode or decode",
      },
    },
    required: ["data"],
  },
};
