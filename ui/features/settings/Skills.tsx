import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SkillFile {
  filename: string;
  content: string;
  is_system: boolean;
}

export default function SettingsSkills() {
  const [skills, setSkills] = useState<SkillFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    try {
      const list = await invoke<SkillFile[]>("list_skills");
      setSkills(list);
      if (!selected && list.length > 0) {
        setSelected(list[0].filename);
        setEditContent(list[0].content);
        setDirty(false);
      }
    } catch {
      // ignore
    }
  }

  function handleSelect(filename: string) {
    const skill = skills.find((s) => s.filename === filename);
    if (!skill) return;
    setSelected(filename);
    setEditContent(skill.content);
    setDirty(false);
    setIsCreating(false);
  }

  async function handleSave() {
    if (!selected || !dirty) return;
    setSaving(true);
    try {
      await invoke("save_skill", { filename: selected, content: editContent });
      setSkills((prev) =>
        prev.map((s) => (s.filename === selected ? { ...s, content: editContent } : s)),
      );
      setDirty(false);
    } catch {
      // ignore
    }
    setSaving(false);
  }

  function handleStartCreate() {
    setIsCreating(true);
    setNewName("");
    setTimeout(() => newNameRef.current?.focus(), 0);
  }

  async function handleCreate() {
    let name = newName.trim();
    if (!name) {
      setIsCreating(false);
      return;
    }
    if (!name.endsWith(".md")) name += ".md";
    try {
      await invoke("create_skill", {
        filename: name,
        content: `# ${name.replace(".md", "")}\n\nDescribe this skill here.\n`,
      });
      await loadSkills();
      setSelected(name);
      const skill = (await invoke<SkillFile[]>("list_skills")).find((s) => s.filename === name);
      if (skill) setEditContent(skill.content);
      setDirty(false);
    } catch {
      // ignore
    }
    setIsCreating(false);
  }

  async function handleDelete(filename: string) {
    try {
      await invoke("delete_skill", { filename });
      setSkills((prev) => prev.filter((s) => s.filename !== filename));
      if (selected === filename) {
        setSelected(null);
        setEditContent("");
        setDirty(false);
      }
    } catch {
      // ignore
    }
  }

  async function handleReset() {
    try {
      await invoke("reset_skills");
      await loadSkills();
      if (selected) {
        const list = await invoke<SkillFile[]>("list_skills");
        const skill = list.find((s) => s.filename === selected);
        if (skill) {
          setEditContent(skill.content);
          setDirty(false);
        }
      }
    } catch {
      // ignore
    }
  }

  const selectedSkill = skills.find((s) => s.filename === selected);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Skills</h1>
        <button
          onClick={handleReset}
          className="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          Reset defaults
        </button>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Skills are prompt files that shape how your AI behaves. System skills cannot be deleted, only edited.
      </p>

      <div className="flex min-h-[400px] overflow-hidden rounded-lg border border-border bg-surface">
        {/* File list */}
        <div className="flex w-44 shrink-0 flex-col border-r border-border">
          <div className="flex-1 overflow-y-auto p-2">
            {skills.map((skill) => (
              <div key={skill.filename} className="group flex items-center">
                <button
                  onClick={() => handleSelect(skill.filename)}
                  className={`flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                    selected === skill.filename
                      ? "bg-surface-raised text-foreground"
                      : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
                  }`}
                >
                  <svg
                    className="h-3 w-3 shrink-0 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  <span className="truncate">{skill.filename.replace(".md", "")}</span>
                  {skill.is_system && (
                    <span className="ml-auto shrink-0 rounded bg-input px-1 text-[10px] text-muted-foreground">
                      sys
                    </span>
                  )}
                </button>
                {!skill.is_system && (
                  <button
                    onClick={() => handleDelete(skill.filename)}
                    className="mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-500/20 hover:text-red-500 group-hover:flex"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {isCreating ? (
              <div className="mt-1 px-1">
                <input
                  ref={newNameRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setIsCreating(false);
                  }}
                  onBlur={handleCreate}
                  placeholder="filename..."
                  className="w-full rounded bg-input px-2 py-1 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-muted-foreground"
                />
              </div>
            ) : (
              <button
                onClick={handleStartCreate}
                className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-raised/60 hover:text-foreground"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New skill
              </button>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{selected}</span>
                  {selectedSkill?.is_system && (
                    <span className="rounded bg-input px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      system
                    </span>
                  )}
                  {dirty && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-600">
                      unsaved
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="rounded bg-[#55aaff] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#66bbff] disabled:opacity-30"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
              <textarea
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  setDirty(true);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                className="min-h-[350px] flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-foreground placeholder-muted-foreground outline-none"
                placeholder="Write your prompt here..."
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a skill to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
