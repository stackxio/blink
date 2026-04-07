import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store";

interface Props {
  onOpen: (path: string, name: string) => void;
  onClose: () => void;
}

export default function RecentFilesPopup({ onOpen, onClose }: Props) {
  const recentFiles = useAppStore((s) => s.activeWorkspace()?.recentFiles ?? []);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? recentFiles.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : recentFiles;

  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered.length, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selectedIdx];
      if (item) {
        onOpen(item.path, item.name);
        onClose();
      }
    }
  }

  function handleClick(item: { path: string; name: string }) {
    onOpen(item.path, item.name);
    onClose();
  }

  return (
    <div className="recent-files-popup__backdrop" onClick={onClose}>
      <div className="recent-files-popup" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="recent-files-popup__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Recent files…"
        />
        <div className="recent-files-popup__results">
          {filtered.length === 0 && (
            <div className="recent-files-popup__empty">No recent files</div>
          )}
          {filtered.map((item, idx) => (
            <button
              key={item.path}
              type="button"
              className={`recent-files-popup__item${idx === selectedIdx ? " recent-files-popup__item--active" : ""}`}
              onClick={() => handleClick(item)}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="recent-files-popup__item-name">{item.name}</span>
              <span className="recent-files-popup__item-path">{item.path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
