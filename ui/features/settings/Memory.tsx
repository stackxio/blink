import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, RotateCcw } from "lucide-react";
import { useAppStore } from "@/store";

const USER_MD_PLACEHOLDER = `# User Preferences

Add your personal preferences and context here. This file is included in every
conversation as part of the system prompt.

Examples:
- Preferred languages and frameworks
- Coding style preferences
- Things the AI should always or never do
- Background context about your projects
`;

const PROJECT_MD_PLACEHOLDER = `# Project Memory

Document project-specific context here. Blink includes this in every conversation
when this workspace is open.

Examples:
- Project purpose and architecture
- Tech stack and key dependencies
- Important conventions and patterns
- Current sprint goals or known issues
`;

function MemorySection({
  title,
  description,
  content,
  placeholder,
  saving,
  saved,
  onSave,
  onChange,
}: {
  title: string;
  description: string;
  content: string;
  placeholder: string;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="memory-section">
      <div className="memory-section__header">
        <div>
          <div className="memory-section__title">{title}</div>
          <div className="memory-section__desc">{description}</div>
        </div>
        <button
          className={`memory-section__save${saved ? " memory-section__save--saved" : ""}`}
          onClick={onSave}
          disabled={saving}
        >
          {saved ? <><Save size={13} /> Saved</> : saving ? "Saving…" : <><Save size={13} /> Save</>}
        </button>
      </div>
      <textarea
        className="memory-section__textarea"
        value={content}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

export default function SettingsMemory() {
  const workspacePath = useAppStore((s) => s.activeWorkspace()?.path ?? null);

  const [userMd, setUserMd] = useState("");
  const [userMdPath, setUserMdPath] = useState<string | null>(null);
  const [userMdSaving, setUserMdSaving] = useState(false);
  const [userMdSaved, setUserMdSaved] = useState(false);

  const [projectMd, setProjectMd] = useState("");
  const [projectMdSaving, setProjectMdSaving] = useState(false);
  const [projectMdSaved, setProjectMdSaved] = useState(false);

  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const homeDir = await invoke<string>("get_home_dir");
      const mdPath = `${homeDir}/.codrift/user.md`;
      setUserMdPath(mdPath);
      try {
        const content = await invoke<string>("read_file_content", { path: mdPath });
        setUserMd(content);
      } catch {
        setUserMd("");
      }

      if (workspacePath) {
        try {
          const content = await invoke<string>("read_file_content", {
            path: `${workspacePath}/AGENTS.md`,
          });
          setProjectMd(content);
        } catch {
          setProjectMd("");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { load(); }, [load]);

  async function saveUserMd() {
    if (!userMdPath) return;
    setUserMdSaving(true);
    try {
      await invoke("write_file_content", { path: userMdPath, content: userMd });
      setUserMdSaved(true);
      setTimeout(() => setUserMdSaved(false), 2000);
    } finally {
      setUserMdSaving(false);
    }
  }

  async function saveProjectMd() {
    if (!workspacePath) return;
    setProjectMdSaving(true);
    try {
      await invoke("write_file_content", {
        path: `${workspacePath}/AGENTS.md`,
        content: projectMd,
      });
      setProjectMdSaved(true);
      setTimeout(() => setProjectMdSaved(false), 2000);
    } finally {
      setProjectMdSaving(false);
    }
  }

  if (loading) {
    return <div className="settings-loading">Loading memory files…</div>;
  }

  return (
    <div className="settings-memory">
      <div className="settings-section-title">Memory</div>
      <p className="settings-section-desc">
        These markdown files are injected into every AI conversation as context.
        Use them to give the AI persistent knowledge about you and your project.
      </p>

      <MemorySection
        title="User Memory"
        description={`Global preferences included in every workspace — ${userMdPath ?? "~/.codrift/user.md"}`}
        content={userMd}
        placeholder={USER_MD_PLACEHOLDER}
        saving={userMdSaving}
        saved={userMdSaved}
        onSave={saveUserMd}
        onChange={setUserMd}
      />

      {workspacePath ? (
        <MemorySection
          title="Project Memory"
          description={`Workspace-specific context — ${workspacePath}/AGENTS.md`}
          content={projectMd}
          placeholder={PROJECT_MD_PLACEHOLDER}
          saving={projectMdSaving}
          saved={projectMdSaved}
          onSave={saveProjectMd}
          onChange={setProjectMd}
        />
      ) : (
        <div className="memory-section memory-section--disabled">
          <div className="memory-section__title">Project Memory</div>
          <div className="memory-section__desc">Open a workspace folder to edit project memory.</div>
        </div>
      )}

      <div className="memory-hint">
        <RotateCcw size={11} />
        Changes take effect on the next conversation — restart the AI panel or start a new thread.
      </div>
    </div>
  );
}
