/** URL-encode or decode a string, with optional component-only mode. */

export async function url_encode(input: Record<string, unknown>): Promise<string> {
  const value = input["value"] as string;
  const mode = (input["mode"] as string) || "encode";
  const component = input["component"] === true;

  if (value == null) return "Error: value is required.";

  try {
    if (mode === "decode") {
      return component ? decodeURIComponent(value) : decodeURI(value);
    }
    return component ? encodeURIComponent(value) : encodeURI(value);
  } catch (e) {
    return `Error: ${String(e)}`;
  }
}

export const def = {
  name: "url_encode",
  description:
    "URL-encode or decode a string. Use component:true for encodeURIComponent (escapes more characters like /, ?, &), false for encodeURI (preserves URL structure).",
  parameters: {
    type: "object",
    properties: {
      value: {
        type: "string",
        description: "String to encode or decode",
      },
      mode: {
        type: "string",
        enum: ["encode", "decode"],
        description: "Whether to encode or decode (default: encode)",
      },
      component: {
        type: "boolean",
        description: "Use encodeURIComponent/decodeURIComponent (default: false)",
      },
    },
    required: ["value"],
  },
};
