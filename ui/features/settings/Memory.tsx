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
    return () => { cancelled = true; };
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Memory</h1>
          <p className="text-xs text-muted-foreground">
            Daily memory logs stored in ~/.caret/memory/
          </p>
        </div>
        <button
          onClick={handleClearToday}
          className="flex items-center gap-1.5 rounded-md bg-input px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <Trash2 size={12} />
          Clear today
        </button>
      </div>

      <div className="flex gap-4">
        {/* File list */}
        <div className="w-40 shrink-0 space-y-0.5">
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">No memory files yet.</p>
          ) : (
            files.map((f) => (
              <button
                key={f}
                onClick={() => selectFile(f)}
                className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                  selectedFile === f
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
                }`}
              >
                {f.replace(".md", "")}
              </button>
            ))
          )}
        </div>

        {/* Content viewer */}
        <div className="min-h-[300px] flex-1 rounded-lg border border-border bg-surface p-4">
          {selectedFile ? (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {content || "(empty)"}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">Select a memory file to view.</p>
          )}
        </div>
      </div>
    </div>
  );
}
