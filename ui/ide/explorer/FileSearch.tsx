import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { File } from "lucide-react";

interface Props {
  workspacePath: string;
  onSelect: (relativePath: string) => void;
  onClose: () => void;
}

export default function FileSearch({ workspacePath, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load file list on mount
  useEffect(() => {
    invoke<string[]>("list_all_files", { root: workspacePath, maxFiles: 10000 })
      .then(setAllFiles)
      .catch(() => setAllFiles([]));
  }, [workspacePath]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fuzzy filter
  const filtered = useMemo(() => {
    if (!query.trim()) return allFiles.slice(0, 50);
    const q = query.toLowerCase();
    const scored = allFiles
      .map((f) => ({ file: f, score: fuzzyScore(f.toLowerCase(), q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 50).map((r) => r.file);
  }, [allFiles, query]);

  const resultsRef = useRef<HTMLDivElement>(null);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered]);

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const item = container.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIdx]) {
        onSelect(filtered[selectedIdx]);
        onClose();
      }
    }
  }

  return (
    <div className="file-search__backdrop" onClick={onClose}>
      <div className="file-search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="file-search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files by name…"
        />
        <div className="file-search__results" ref={resultsRef}>
          {filtered.length === 0 && query && (
            <div className="file-search__empty">No files found</div>
          )}
          {filtered.map((file, i) => {
            const parts = file.split("/");
            const name = parts.pop() || file;
            const dir = parts.join("/");
            return (
              <button
                key={file}
                type="button"
                className={`file-search__item ${i === selectedIdx ? "file-search__item--active" : ""}`}
                onClick={() => { onSelect(file); onClose(); }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <File size={14} />
                <span className="file-search__item-name">{name}</span>
                <span className="file-search__item-path">{file}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function fuzzyScore(str: string, query: string): number {
  let score = 0;
  let qi = 0;
  let consecutive = 0;

  for (let si = 0; si < str.length && qi < query.length; si++) {
    if (str[si] === query[qi]) {
      score += 1 + consecutive;
      consecutive++;
      qi++;
      // Bonus for matching after separator
      if (si === 0 || str[si - 1] === "/" || str[si - 1] === ".") score += 5;
    } else {
      consecutive = 0;
    }
  }

  return qi === query.length ? score : 0;
}

function highlightMatch(file: string, query: string): React.ReactNode {
  if (!query) return file;
  const parts: React.ReactNode[] = [];
  const q = query.toLowerCase();
  const f = file.toLowerCase();
  let qi = 0;
  let lastEnd = 0;

  for (let i = 0; i < f.length && qi < q.length; i++) {
    if (f[i] === q[qi]) {
      if (i > lastEnd) parts.push(file.slice(lastEnd, i));
      parts.push(<strong key={i}>{file[i]}</strong>);
      lastEnd = i + 1;
      qi++;
    }
  }
  if (lastEnd < file.length) parts.push(file.slice(lastEnd));
  return parts;
}
