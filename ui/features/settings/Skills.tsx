import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setupMonaco, observeMonacoTheme } from "@/ide/editor/monaco-setup";

interface SkillFile {
  filename: string;
  content: string;
  is_system: boolean;
}

function SkillEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const themeCleanupRef = useRef<(() => void) | null>(null);
  const suppressRef = useRef(false);

  // Boot Monaco once
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const monacoApi = await setupMonaco();
      if (cancelled || !hostRef.current) return;
      monacoRef.current = monacoApi;

      const editor = monacoApi.editor.create(hostRef.current, {
        value,
        language: "markdown",
        theme: "codrift",
        automaticLayout: true,
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        lineHeight: 1.6,
        wordWrap: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "none",
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        glyphMargin: false,
        folding: false,
        lineNumbers: "off",
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        padding: { top: 16, bottom: 16 },
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      });
      editorRef.current = editor;

      editor.onDidChangeModelContent(() => {
        suppressRef.current = true;
        onChange(editor.getValue());
        suppressRef.current = false;
      });

      themeCleanupRef.current = observeMonacoTheme(monacoApi, () => {
        editor.updateOptions({});
      });
    })();

    return () => {
      cancelled = true;
      themeCleanupRef.current?.();
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (tab switch)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || suppressRef.current) return;
    if (editor.getValue() !== value) {
      const pos = editor.getPosition();
      editor.setValue(value);
      if (pos) editor.setPosition(pos);
    }
  }, [value]);

  return <div ref={hostRef} style={{ flex: 1, minHeight: 0 }} />;
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

  const loadSkills = useCallback(async () => {
    try {
      const list = await invoke<SkillFile[]>("list_skills");
      setSkills(list);
      if (list.length > 0) {
        setSelected(list[0].filename);
        setEditContent(list[0].content);
        setDirty(false);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await invoke<SkillFile[]>("list_skills");
        if (!cancelled) {
          setSkills(list);
          if (list.length > 0) {
            setSelected(list[0].filename);
            setEditContent(list[0].content);
            setDirty(false);
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="settings-section">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h1 className="settings-section__title" style={{ marginBottom: 0 }}>
          Skills
        </h1>
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleReset}>
          Reset defaults
        </button>
      </div>

      <p className="settings-section__description">
        Skills are prompt files that shape how your AI behaves. System skills cannot be deleted,
        only edited.
      </p>

      <div className="settings-card" style={{ display: "flex", height: 560 }}>
        {/* File list */}
        <div
          style={{
            width: 176,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--c-border)",
          }}
        >
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {skills.map((skill) => (
              <div key={skill.filename} style={{ display: "flex", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm btn--full"
                  onClick={() => handleSelect(skill.filename)}
                  style={{
                    flex: 1,
                    justifyContent: "flex-start",
                    padding: "6px 8px",
                    ...(selected === skill.filename
                      ? { background: "var(--c-surface-raised)", color: "var(--c-fg)" }
                      : {}),
                  }}
                >
                  <svg
                    style={{ width: 12, height: 12, flexShrink: 0, color: "var(--c-muted-fg)" }}
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
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {skill.filename.replace(".md", "")}
                  </span>
                  {skill.is_system && (
                    <span
                      style={{
                        marginLeft: "auto",
                        flexShrink: 0,
                        borderRadius: "var(--radius-sm)",
                        background: "var(--c-input)",
                        padding: "0 4px",
                        fontSize: 10,
                        color: "var(--c-muted-fg)",
                      }}
                    >
                      sys
                    </span>
                  )}
                </button>
                {!skill.is_system && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => handleDelete(skill.filename)}
                    style={{ width: 20, height: 20, marginRight: 4 }}
                  >
                    <svg
                      style={{ width: 12, height: 12 }}
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
              <div style={{ marginTop: 4, padding: "0 4px" }}>
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
                  className="input input--sm"
                />
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--ghost btn--sm btn--full"
                onClick={handleStartCreate}
                style={{ marginTop: 4, justifyContent: "flex-start", padding: "6px 8px" }}
              >
                <svg
                  style={{ width: 12, height: 12 }}
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
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {selected ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--c-border)",
                  padding: "8px 16px",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      fontWeight: 500,
                      color: "var(--c-fg)",
                    }}
                  >
                    {selected}
                  </span>
                  {selectedSkill?.is_system && (
                    <span
                      style={{
                        borderRadius: "var(--radius-sm)",
                        background: "var(--c-input)",
                        padding: "2px 6px",
                        fontSize: 10,
                        color: "var(--c-muted-fg)",
                      }}
                    >
                      system
                    </span>
                  )}
                  {dirty && (
                    <span
                      style={{
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(245,158,11,0.2)",
                        padding: "2px 6px",
                        fontSize: 10,
                        color: "#d97706",
                      }}
                    >
                      unsaved
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn--default btn--sm"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
              <SkillEditor
                key={selected}
                value={editContent}
                onChange={(v) => {
                  setEditContent(v);
                  setDirty(true);
                }}
              />
            </>
          ) : (
            <div className="empty-state">
              <span className="empty-state__text">Select a skill to edit</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
