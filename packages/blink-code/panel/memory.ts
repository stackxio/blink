import { invoke } from "@tauri-apps/api/core";

export type MemoryPayload = {
  blinkMd: string | null;
  userMd: string | null;
  userMdPath: string | null;
  skillsSummary: string | null;
};

function joinWithWorkspace(root: string, rel: string): string {
  const a = root.replace(/\/+$/, "");
  const b = rel.replace(/^\/+/, "");
  return `${a}/${b}`;
}

export async function loadMemory(workspacePath: string | null): Promise<MemoryPayload> {
  // Load global user memory from ~/.blink/user.md
  let userMd: string | null = null;
  let userMdPath: string | null = null;
  try {
    const homeDir = await invoke<string>("get_home_dir");
    userMdPath = `${homeDir}/.codrift/user.md`;
    userMd = await invoke<string>("read_file_content", { path: userMdPath });
  } catch {
    userMd = null;
  }

  if (!workspacePath) {
    return { blinkMd: null, userMd, userMdPath, skillsSummary: null };
  }

  let blinkMd: string | null = null;
  try {
    const path = joinWithWorkspace(workspacePath, "CODRIFT.md");
    blinkMd = await invoke<string>("read_file_content", { path });
  } catch {
    blinkMd = null;
  }

  let skillsSummary: string | null = null;
  try {
    // get_combined_skills returns all skill file contents merged into one string
    const combined = await invoke<string>("get_combined_skills");
    if (combined?.trim()) skillsSummary = combined;
  } catch {
    skillsSummary = null;
  }

  return { blinkMd, userMd, userMdPath, skillsSummary };
}
