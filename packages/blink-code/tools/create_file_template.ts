import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";

/** Create a new file from a template (React component, Rust module, Python class, etc.). */

type TemplateKey =
  | "react-component"
  | "react-hook"
  | "typescript-class"
  | "typescript-interface"
  | "rust-module"
  | "rust-struct"
  | "python-class"
  | "python-script"
  | "express-route"
  | "jest-test"
  | "vitest-test"
  | "github-action"
  | "dockerfile";

function getTemplate(key: TemplateKey, name: string, options: Record<string, string>): string {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const snake = name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");

  switch (key) {
    case "react-component":
      return `import { type FC } from "react";\n\ninterface ${pascal}Props {\n  // props\n}\n\nexport const ${pascal}: FC<${pascal}Props> = ({}) => {\n  return (\n    <div>\n      {/* ${pascal} */}\n    </div>\n  );\n};\n`;

    case "react-hook":
      return `import { useState, useEffect } from "react";\n\nexport function use${pascal}() {\n  const [state, setState] = useState<unknown>(null);\n\n  useEffect(() => {\n    // side effect\n  }, []);\n\n  return { state };\n}\n`;

    case "typescript-class":
      return `export class ${pascal} {\n  constructor() {}\n\n  // methods\n}\n`;

    case "typescript-interface":
      return `export interface ${pascal} {\n  id: string;\n  // fields\n}\n`;

    case "rust-module":
      return `//! ${pascal} module\n\npub mod ${snake} {\n    pub fn ${snake}() {\n        todo!()\n    }\n}\n`;

    case "rust-struct":
      return `use serde::{Deserialize, Serialize};\n\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${pascal} {\n    // fields\n}\n\nimpl ${pascal} {\n    pub fn new() -> Self {\n        Self {\n            // init\n        }\n    }\n}\n`;

    case "python-class":
      return `class ${pascal}:\n    """${pascal} class."""\n\n    def __init__(self):\n        pass\n\n    def __repr__(self) -> str:\n        return f"${pascal}()"\n`;

    case "python-script":
      return `#!/usr/bin/env python3\n"""${pascal} script."""\n\nimport argparse\nimport sys\n\n\ndef main() -> int:\n    parser = argparse.ArgumentParser(description="${pascal}")\n    args = parser.parse_args()\n    return 0\n\n\nif __name__ == "__main__":\n    sys.exit(main())\n`;

    case "express-route":
      return `import { Router, Request, Response } from "express";\n\nconst router = Router();\n\nrouter.get("/${snake}", async (req: Request, res: Response) => {\n  res.json({ message: "ok" });\n});\n\nexport default router;\n`;

    case "jest-test":
      return `import { describe, it, expect } from "@jest/globals";\n\ndescribe("${pascal}", () => {\n  it("should work", () => {\n    expect(true).toBe(true);\n  });\n});\n`;

    case "vitest-test":
      return `import { describe, it, expect } from "vitest";\n\ndescribe("${pascal}", () => {\n  it("should work", () => {\n    expect(true).toBe(true);\n  });\n});\n`;

    case "github-action":
      return `name: ${pascal}\n\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n\njobs:\n  ${snake}:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Run\n        run: echo "hello"\n`;

    case "dockerfile":
      return `FROM node:20-alpine AS base\nWORKDIR /app\n\nFROM base AS deps\nCOPY package*.json ./\nRUN npm ci\n\nFROM base AS builder\nCOPY --from=deps /app/node_modules ./node_modules\nCOPY . .\nRUN npm run build\n\nFROM base AS runner\nCOPY --from=builder /app/dist ./dist\nEXPOSE 3000\nCMD ["node", "dist/index.js"]\n`;

    default:
      return `// ${pascal}\n`;
  }
}

export async function create_file_template(input: Record<string, unknown>): Promise<string> {
  const filePath = input["path"] as string;
  const template = input["template"] as TemplateKey;
  const name = (input["name"] as string) || "MyComponent";
  const root = (input["root"] as string) || process.cwd();

  if (!filePath) return "Error: path is required.";
  if (!template) return "Error: template is required.";

  const validTemplates: TemplateKey[] = [
    "react-component", "react-hook", "typescript-class", "typescript-interface",
    "rust-module", "rust-struct", "python-class", "python-script",
    "express-route", "jest-test", "vitest-test", "github-action", "dockerfile",
  ];

  if (!validTemplates.includes(template)) {
    return `Unknown template: ${template}. Available: ${validTemplates.join(", ")}`;
  }

  const absPath = filePath.startsWith("/") ? filePath : resolve(root, filePath);

  try {
    await mkdir(dirname(absPath), { recursive: true });
    const content = getTemplate(template, name, {});
    await writeFile(absPath, content, { encoding: "utf8", flag: "wx" }); // fail if exists
    return `Created ${filePath} from template '${template}':\n\n${content}`;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      return `File already exists: ${filePath}. Use write_file to overwrite.`;
    }
    return `Error creating file: ${String(e)}`;
  }
}

export const def = {
  name: "create_file_template",
  description:
    "Create a new file from a code template. Templates: react-component, react-hook, typescript-class, typescript-interface, rust-module, rust-struct, python-class, python-script, express-route, jest-test, vitest-test, github-action, dockerfile.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Output file path (absolute or relative to root). Fails if file already exists.",
      },
      template: {
        type: "string",
        description: "Template name (e.g. 'react-component', 'rust-struct', 'jest-test')",
      },
      name: {
        type: "string",
        description: "Component/class/struct name used in the template (default: 'MyComponent')",
      },
      root: {
        type: "string",
        description: "Base directory for relative paths (default: current workspace)",
      },
    },
    required: ["path", "template"],
  },
};
