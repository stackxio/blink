import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";

export default function SettingsMemory() {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await invoke<string[]>("list_memory_files");
        if (!cancelled) {
          setFiles(list);
          if (list.length > 0) {
            const first = list[0];
            setSelectedFile(first);
            try {
              const text = await invoke<string>("read_memory_file", { filename: first });
              if (!cancelled) setContent(text);
            } catch {
              if (!cancelled) setContent("");
            }
          }
        }
      } catch {
        if (!cancelled) setFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectFile(filename: string) {
    setSelectedFile(filename);
    try {
      const text = await invoke<string>("read_memory_file", { filename });
      setContent(text);
    } catch {
      setContent("");
    }
  }

  async function loadFiles() {
    try {
      const list = await invoke<string[]>("list_memory_files");
      setFiles(list);
    } catch {
      setFiles([]);
    }
  }

  async function handleClearToday() {
    try {
      await invoke("clear_today_memory");
      await loadFiles();
      setSelectedFile(null);
      setContent("");
    } catch {
      // Non-critical
    }
  }

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
        <div>
          <h1 className="settings-section__title" style={{ marginBottom: 4 }}>
            Memory
          </h1>
          <p className="settings-section__description" style={{ marginBottom: 0 }}>
            Daily memory logs stored in ~/.blink/memory/
          </p>
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={handleClearToday}>
          <Trash2 size={12} />
          Clear today
        </button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* File list */}
        <div
          style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}
        >
          {files.length === 0 ? (
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--c-muted-fg)" }}>
              No memory files yet.
            </span>
          ) : (
            files.map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn--ghost btn--sm btn--full`}
                onClick={() => selectFile(f)}
                style={
                  selectedFile === f
                    ? { background: "var(--c-surface-raised)", color: "var(--c-fg)" }
                    : {}
                }
              >
                {f.replace(".md", "")}
              </button>
            ))
          )}
        </div>

        {/* Content viewer */}
        <div className="settings-card" style={{ flex: 1, minHeight: 300, padding: 16 }}>
          {selectedFile ? (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "var(--font-size-xs)",
                lineHeight: 1.6,
                color: "var(--c-fg)",
              }}
            >
              {content || "(empty)"}
            </pre>
          ) : (
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--c-muted-fg)" }}>
              Select a memory file to view.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
