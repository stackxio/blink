import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SkillFile {
  filename: string;
  content: string;
  is_system: boolean;
}

interface SkillsPanelProps {
  onClose: () => void;
}

export default function SkillsPanel({ onClose }: SkillsPanelProps) {
  const [skills, setSkills] = useState<SkillFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    try {
      const list = await invoke<SkillFile[]>("list_skills");
      setSkills(list);
      // Select first if nothing selected
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
      await invoke("create_skill", { filename: name, content: `# ${name.replace(".md", "")}\n\nDescribe this skill here.\n` });
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
      // Re-select current if it was a system file
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-[#55aaff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <h2 className="text-sm font-medium text-neutral-100">Skills</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="rounded px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
              title="Reset system prompts to defaults"
            >
              Reset defaults
            </button>
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* File list */}
          <div className="flex w-48 shrink-0 flex-col border-r border-neutral-800">
            <div className="flex-1 overflow-y-auto p-2">
              {skills.map((skill) => (
                <div
                  key={skill.filename}
                  className="group flex items-center"
                >
                  <button
                    onClick={() => handleSelect(skill.filename)}
                    className={`flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      selected === skill.filename
                        ? "bg-surface-raised text-neutral-100"
                        : "text-neutral-400 hover:bg-surface-raised/60 hover:text-neutral-200"
                    }`}
                  >
                    <svg className="h-3 w-3 shrink-0 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="truncate">{skill.filename.replace(".md", "")}</span>
                    {skill.is_system && (
                      <span className="ml-auto shrink-0 rounded bg-neutral-800 px-1 text-[10px] text-neutral-600">sys</span>
                    )}
                  </button>
                  {!skill.is_system && (
                    <button
                      onClick={() => handleDelete(skill.filename)}
                      className="mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-600 hover:bg-red-900/30 hover:text-red-400 group-hover:flex"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                    className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-neutral-600"
                  />
                </div>
              ) : (
                <button
                  onClick={handleStartCreate}
                  className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-surface-raised/60 hover:text-neutral-400"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                <div className="flex items-center justify-between border-b border-neutral-800/60 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-300">{selected}</span>
                    {selectedSkill?.is_system && (
                      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">system</span>
                    )}
                    {dirty && (
                      <span className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] text-amber-400">unsaved</span>
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
                  ref={textareaRef}
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
                  className="flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-neutral-300 placeholder-neutral-600 outline-none"
                  placeholder="Write your prompt here..."
                  spellCheck={false}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-600">
                Select a skill to edit
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
