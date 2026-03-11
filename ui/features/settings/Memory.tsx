import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";

export default function SettingsMemory() {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");

  useEffect(() => {
    loadFiles();
  }, []);

  async function loadFiles() {
    try {
      const list = await invoke<string[]>("list_memory_files");
      setFiles(list);
      if (list.length > 0 && !selectedFile) {
        selectFile(list[0]);
      }
    } catch {
      setFiles([]);
    }
  }

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
          <h1 className="text-lg font-semibold text-neutral-100">Memory</h1>
          <p className="text-xs text-neutral-500">
            Daily memory logs stored in ~/.caret/memory/
          </p>
        </div>
        <button
          onClick={handleClearToday}
          className="flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
        >
          <Trash2 size={12} />
          Clear today
        </button>
      </div>

      <div className="flex gap-4">
        {/* File list */}
        <div className="w-40 shrink-0 space-y-0.5">
          {files.length === 0 ? (
            <p className="text-xs text-neutral-600">No memory files yet.</p>
          ) : (
            files.map((f) => (
              <button
                key={f}
                onClick={() => selectFile(f)}
                className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                  selectedFile === f
                    ? "bg-neutral-800 text-neutral-200"
                    : "text-neutral-500 hover:bg-neutral-800/50 hover:text-neutral-300"
                }`}
              >
                {f.replace(".md", "")}
              </button>
            ))
          )}
        </div>

        {/* Content viewer */}
        <div className="min-h-[300px] flex-1 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          {selectedFile ? (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
              {content || "(empty)"}
            </pre>
          ) : (
            <p className="text-xs text-neutral-600">Select a memory file to view.</p>
          )}
        </div>
      </div>
    </div>
  );
}
