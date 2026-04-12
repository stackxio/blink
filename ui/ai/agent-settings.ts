// ── Agent definitions ─────────────────────────────────────────────────────────

export interface AgentDef {
  id: string;
  label: string;
  description: string;
  /** Primary binary name used for PATH detection */
  binary: string;
  buildCmd: (opts?: { customPath?: string; skills?: string }) => string[];
  /** If defined, a "Resume" button appears that runs this command instead */
  resumeCmd?: (opts?: { customPath?: string }) => string[];
}

export const ALL_AGENTS: AgentDef[] = [
  {
    id: "claude",
    label: "Claude Code",
    description:
      "Anthropic's coding agent for reading code, editing files, and running terminal workflows.",
    binary: "claude",
    buildCmd: ({ customPath, skills } = {}) => {
      const cmd = [customPath || "claude", "--dangerously-skip-permissions"];
      if (skills?.trim()) cmd.push("--system-prompt", skills);
      return cmd;
    },
    // --resume with no session ID opens Claude's interactive session picker
    resumeCmd: ({ customPath } = {}) => [
      customPath || "claude",
      "--resume",
      "--dangerously-skip-permissions",
    ],
  },
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI's coding agent for reading, modifying, and running code across tasks.",
    binary: "codex",
    buildCmd: ({ customPath } = {}) => [customPath || "codex"],
    // codex resume (no args) opens Codex's interactive session picker
    resumeCmd: ({ customPath } = {}) => [customPath || "codex", "resume"],
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Google's open-source terminal agent for coding, problem-solving, and task work.",
    binary: "gemini",
    buildCmd: ({ customPath, skills } = {}) => {
      const cmd = [customPath || "gemini"];
      if (skills?.trim()) cmd.push("--system-prompt", skills);
      return cmd;
    },
    // --resume with no arg opens the interactive session picker
    resumeCmd: ({ customPath } = {}) => [customPath || "gemini", "--resume"],
  },
  {
    id: "opencode",
    label: "OpenCode",
    description: "Open-source coding agent for the terminal, IDE, and desktop.",
    binary: "opencode",
    buildCmd: ({ customPath } = {}) => [customPath || "opencode"],
    // --continue resumes the most recent OpenCode session
    resumeCmd: ({ customPath } = {}) => [customPath || "opencode", "--continue"],
  },
  {
    id: "pi",
    label: "Pi",
    description: "Minimal terminal coding harness for flexible coding workflows.",
    binary: "pi",
    buildCmd: ({ customPath } = {}) => [customPath || "pi"],
  },
  {
    id: "gh-copilot",
    label: "Copilot",
    description: "GitHub's coding agent for planning, editing, and building in your repo.",
    binary: "gh",
    buildCmd: ({ customPath } = {}) => [customPath || "gh", "copilot", "suggest", "-t", "shell"],
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    description: "Cursor's coding agent for editing, running, and debugging code in parallel.",
    binary: "cursor",
    buildCmd: ({ customPath } = {}) => [customPath || "cursor", "--agent"],
  },
];

// ── Per-agent user configuration ──────────────────────────────────────────────

export interface AgentUserConfig {
  enabled: boolean;
  customPath: string; // empty = use system PATH
}

export type AgentSettings = Record<string, AgentUserConfig>;

const STORAGE_KEY = "codrift:agent-settings";

const DEFAULTS: AgentSettings = {
  claude: { enabled: true, customPath: "" },
  codex: { enabled: true, customPath: "" },
  gemini: { enabled: true, customPath: "" },
  opencode: { enabled: true, customPath: "" },
  pi: { enabled: false, customPath: "" },
  "gh-copilot": { enabled: false, customPath: "" },
  cursor: { enabled: false, customPath: "" },
};

export function loadAgentSettings(): AgentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, AgentUserConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAgentSettings(settings: AgentSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
