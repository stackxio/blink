/** Semantic version comparison, validation, incrementing, and range checking. */

interface SemVer { major: number; minor: number; patch: number; pre?: string; build?: string; raw: string; }

function parse(v: string): SemVer | null {
  const m = String(v).trim().replace(/^v/, "").match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.\-]+))?(?:\+([a-zA-Z0-9.\-]+))?$/,
  );
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    pre: m[4],
    build: m[5],
    raw: v,
  };
}

function compare(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // pre-release: version without pre > version with pre
  if (!a.pre && b.pre) return 1;
  if (a.pre && !b.pre) return -1;
  if (a.pre && b.pre) return a.pre.localeCompare(b.pre);
  return 0;
}

function bump(v: SemVer, type: "major" | "minor" | "patch"): string {
  if (type === "major") return `${v.major + 1}.0.0`;
  if (type === "minor") return `${v.major}.${v.minor + 1}.0`;
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function satisfies(v: SemVer, range: string): boolean {
  // Simple range support: ^x.y.z, ~x.y.z, >=x.y.z, <=x.y.z, >x.y.z, <x.y.z, =x.y.z, x.y.z
  const parts = range.trim().split(/\s+/);
  for (const part of parts) {
    const m = part.match(/^(\^|~|>=|<=|>|<|=)?(.+)$/);
    if (!m) return false;
    const op = m[1] || "=";
    const rv = parse(m[2]);
    if (!rv) return false;
    const c = compare(v, rv);
    switch (op) {
      case "^": {
        // Compatible with: same major, >= minor.patch
        if (v.major !== rv.major) return false;
        if (compare(v, rv) < 0) return false;
        break;
      }
      case "~": {
        // Approximately: same major.minor, >= patch
        if (v.major !== rv.major || v.minor !== rv.minor) return false;
        if (compare(v, rv) < 0) return false;
        break;
      }
      case ">=": if (c < 0) return false; break;
      case "<=": if (c > 0) return false; break;
      case ">":  if (c <= 0) return false; break;
      case "<":  if (c >= 0) return false; break;
      case "=":  if (c !== 0) return false; break;
    }
  }
  return true;
}

export async function semver(input: Record<string, unknown>): Promise<string> {
  const action = (input["action"] as string) || "compare";
  const version = input["version"] as string;
  const version2 = input["version2"] as string;
  const bumpType = (input["bump"] as string) || "patch";
  const range = input["range"] as string;

  switch (action) {
    case "validate": {
      if (!version) return "Error: version is required.";
      const v = parse(version);
      return v
        ? `✅ Valid semver: ${v.major}.${v.minor}.${v.patch}${v.pre ? `-${v.pre}` : ""}${v.build ? `+${v.build}` : ""}`
        : `❌ Invalid semver: "${version}"`;
    }

    case "compare": {
      if (!version || !version2) return "Error: version and version2 are required.";
      const a = parse(version), b = parse(version2);
      if (!a) return `Invalid version: "${version}"`;
      if (!b) return `Invalid version: "${version2}"`;
      const c = compare(a, b);
      return `${version} ${c === 0 ? "=" : c > 0 ? ">" : "<"} ${version2}`;
    }

    case "bump": {
      if (!version) return "Error: version is required.";
      const v = parse(version);
      if (!v) return `Invalid version: "${version}"`;
      if (!["major", "minor", "patch"].includes(bumpType)) {
        return `Unknown bump type: ${bumpType}. Use major, minor, or patch.`;
      }
      return bump(v, bumpType as "major" | "minor" | "patch");
    }

    case "sort": {
      const versions = input["versions"] as string[] | undefined;
      if (!Array.isArray(versions)) return "Error: versions (array) is required for sort.";
      const parsed = versions.map((v) => ({ raw: v, parsed: parse(v) }));
      const invalid = parsed.filter((p) => !p.parsed).map((p) => p.raw);
      if (invalid.length > 0) return `Invalid versions: ${invalid.join(", ")}`;
      const sorted = parsed
        .sort((a, b) => compare(a.parsed!, b.parsed!))
        .map((p) => p.raw);
      return `Sorted (oldest→newest):\n${sorted.join("\n")}`;
    }

    case "satisfies": {
      if (!version) return "Error: version is required.";
      if (!range) return "Error: range is required.";
      const v = parse(version);
      if (!v) return `Invalid version: "${version}"`;
      const result = satisfies(v, range);
      return `${version} ${result ? "✅ satisfies" : "❌ does not satisfy"} range "${range}"`;
    }

    default:
      return `Unknown action: ${action}. Use: validate, compare, bump, sort, satisfies`;
  }
}

export const def = {
  name: "semver",
  description:
    "Semantic versioning utilities: validate a semver string, compare two versions, bump major/minor/patch, sort a list of versions, or check if a version satisfies a range (^1.2.0, ~1.2.0, >=1.0.0, etc.).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["validate", "compare", "bump", "sort", "satisfies"],
        description: "Action to perform (default: compare)",
      },
      version: {
        type: "string",
        description: "Primary version string (e.g. '1.2.3' or 'v2.0.0-beta.1')",
      },
      version2: {
        type: "string",
        description: "Second version for 'compare' action",
      },
      bump: {
        type: "string",
        enum: ["major", "minor", "patch"],
        description: "Which part to bump (for 'bump' action, default: patch)",
      },
      versions: {
        type: "array",
        items: { type: "string" },
        description: "Array of version strings to sort",
      },
      range: {
        type: "string",
        description: "Version range for 'satisfies' (e.g. '^1.2.0', '>=2.0.0 <3.0.0')",
      },
    },
    required: [],
  },
};
