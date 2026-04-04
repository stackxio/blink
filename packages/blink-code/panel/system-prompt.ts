import type { MemoryPayload } from "./memory";

export type WorkspaceContext = {
  path: string | null;
  name: string | null;
  activeFile: string | null;
};

export async function buildSystemPrompt(
  workspace: WorkspaceContext,
  memory: MemoryPayload,
): Promise<string> {
  const lines: string[] = [
    "You are Blink, a coding assistant embedded in the Blink IDE. Be concise and helpful.",
    "",
    "Always use absolute paths when calling file tools. Never use relative paths.",
    "IMPORTANT: All memory context is already included in this system prompt. Do NOT attempt to read user.md, BLINK.md, or any other memory files from the filesystem — they are pre-loaded here.",
  ];

  if (workspace.path) {
    lines.push("", `Workspace root: ${workspace.path}`);
    if (workspace.name) lines.push(`Workspace name: ${workspace.name}`);
    if (workspace.activeFile) lines.push(`Currently open file: ${workspace.activeFile}`);
  } else {
    lines.push("", "No workspace folder is open.");
  }

  // Include user memory content inline — no file path shown to avoid model re-reading
  if (memory.userMd) {
    lines.push("", "### User preferences", memory.userMd);
  }

  if (memory.blinkMd) {
    lines.push("", "### Project memory (BLINK.md)", memory.blinkMd);
  }
  if (memory.skillsSummary) {
    lines.push("", "### Available skills (names only)", memory.skillsSummary);
  }

  return lines.join("\n");
}
