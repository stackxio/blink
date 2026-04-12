export type SlashCommandDef =
  | { name: string; description: string; type?: "local" }
  | { name: string; description: string; type: "prompt"; prompt: string };

// ── Local commands (handled directly in the panel) ────────────────────────────

export const LOCAL_COMMANDS = ["help", "clear", "model", "memory", "context", "compact"] as const;

// ── Prompt commands (injected as a user message to the AI) ─────────────────────

const PROMPT_COMMANDS: Extract<SlashCommandDef, { type: "prompt" }>[] = [
  {
    name: "commit",
    description: "Create a git commit for current changes",
    type: "prompt",
    prompt:
      "Please create a git commit for the current changes. First run `git status` and `git diff HEAD` to understand what's changed, then stage appropriate files and write a clear, conventional commit message. Follow the existing commit style in `git log --oneline -10`.",
  },
  {
    name: "pr",
    description: "Create a pull request for the current branch",
    type: "prompt",
    prompt:
      "Please create a pull request for the current branch. First check `git log main..HEAD --oneline` and `git diff main` to understand the changes, then write a clear PR title and description.",
  },
  {
    name: "review",
    description: "Review the current file or recent changes",
    type: "prompt",
    prompt:
      "Please review the current file (or if none is open, the recent git changes). Look for bugs, logic errors, security issues, and style problems. Be specific about line numbers and suggest concrete fixes.",
  },
  {
    name: "fix",
    description: "Find and fix issues in the current file",
    type: "prompt",
    prompt:
      "Please identify and fix all issues in the current file. Read the file first, then apply fixes directly.",
  },
  {
    name: "test",
    description: "Write tests for the current file",
    type: "prompt",
    prompt:
      "Please write comprehensive tests for the current file. Read the file first to understand what to test, then create or update the test file.",
  },
  {
    name: "explain",
    description: "Explain what the current file does",
    type: "prompt",
    prompt:
      "Please read the current file and give a clear explanation of what it does, its main functions/classes, and how it fits into the project.",
  },
  {
    name: "refactor",
    description: "Suggest and apply refactoring improvements",
    type: "prompt",
    prompt:
      "Please review the current file and apply refactoring improvements: reduce duplication, improve naming, simplify logic, and improve structure. Read the file first.",
  },
  {
    name: "diff",
    description: "Explain the current git diff",
    type: "prompt",
    prompt:
      "Please run `git diff HEAD` and explain the current changes in plain language. Group related changes together.",
  },
  {
    name: "branch",
    description: "Create a new git branch",
    type: "prompt",
    prompt:
      "Please create a new git branch for the work we're about to do. Ask me what the branch should be for if you're not sure, then create it with an appropriate name.",
  },
  {
    name: "init",
    description: "Initialize project memory (AGENTS.md)",
    type: "prompt",
    prompt:
      "Please explore this workspace and create a AGENTS.md file in the project root that documents: the project purpose, tech stack, directory structure, key files, and any important conventions or notes for future sessions.",
  },
];

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: "help", description: "List slash commands" },
  { name: "clear", description: "Clear conversation" },
  { name: "model", description: "Set or show model — /model <name>" },
  { name: "memory", description: "Open AGENTS.md" },
  { name: "context", description: "Show provider and workspace context" },
  { name: "compact", description: "Keep only the last few messages in history" },
  ...PROMPT_COMMANDS,
];

export function getSlashSuggestions(partial: string): SlashCommandDef[] {
  const q = partial.slice(1).toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

export function parseSlashCommand(text: string): { name: string; args: string } | null {
  if (!text.startsWith("/")) return null;
  const rest = text.slice(1).trim();
  const space = rest.indexOf(" ");
  if (space === -1) {
    const name = rest.toLowerCase();
    if (!name || !SLASH_COMMANDS.some((c) => c.name === name)) return null;
    return { name, args: "" };
  }
  const name = rest.slice(0, space).toLowerCase();
  if (!SLASH_COMMANDS.some((c) => c.name === name)) return null;
  return { name, args: rest.slice(space + 1) };
}

export function getPromptCommand(name: string): string | null {
  const cmd = PROMPT_COMMANDS.find((c) => c.name === name);
  return cmd?.prompt ?? null;
}
