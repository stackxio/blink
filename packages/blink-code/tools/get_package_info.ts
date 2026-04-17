/** Get information about an npm package from the registry. */

export async function get_package_info(input: Record<string, unknown>): Promise<string> {
  const pkg = input["package"] as string;
  const version = (input["version"] as string) || "latest";

  if (!pkg) return "Error: package is required.";

  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}/${encodeURIComponent(version)}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      if (resp.status === 404) return `Package '${pkg}' not found on npm.`;
      return `npm registry error: ${resp.status} ${resp.statusText}`;
    }

    const data = await resp.json() as Record<string, unknown>;

    const lines = [
      `Name: ${data.name}`,
      `Version: ${data.version}`,
      data.description ? `Description: ${data.description}` : null,
      data.license ? `License: ${data.license}` : null,
      data.homepage ? `Homepage: ${data.homepage}` : null,
      data.repository && typeof data.repository === "object"
        ? `Repository: ${(data.repository as Record<string, string>).url ?? ""}`
        : null,
    ];

    // Dependencies
    const deps = data.dependencies as Record<string, string> | undefined;
    const devDeps = data.devDependencies as Record<string, string> | undefined;
    const peerDeps = data.peerDependencies as Record<string, string> | undefined;

    if (deps && Object.keys(deps).length > 0) {
      lines.push(`\nDependencies (${Object.keys(deps).length}):`);
      for (const [k, v] of Object.entries(deps).slice(0, 20)) {
        lines.push(`  ${k}: ${v}`);
      }
      if (Object.keys(deps).length > 20) lines.push("  ...");
    }

    if (peerDeps && Object.keys(peerDeps).length > 0) {
      lines.push(`\nPeer Dependencies:`);
      for (const [k, v] of Object.entries(peerDeps)) {
        lines.push(`  ${k}: ${v}`);
      }
    }

    // Keywords
    const keywords = data.keywords as string[] | undefined;
    if (keywords?.length) {
      lines.push(`\nKeywords: ${keywords.slice(0, 10).join(", ")}`);
    }

    return lines.filter(Boolean).join("\n");
  } catch (e) {
    return `Error fetching package info: ${String(e)}`;
  }
}

export const def = {
  name: "get_package_info",
  description:
    "Fetch information about an npm package from the registry: version, description, license, dependencies, and more.",
  parameters: {
    type: "object",
    properties: {
      package: {
        type: "string",
        description: "npm package name (e.g. 'react', '@types/node', 'lodash')",
      },
      version: {
        type: "string",
        description: "Package version to fetch info for (default: 'latest')",
      },
    },
    required: ["package"],
  },
};
