import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Settings, Sparkles, Terminal, Files, GitBranch, Search, Palette,
  FolderOpen, SquarePen, PanelLeftClose, PanelLeftOpen, Sun, Moon,
} from "lucide-react";
import { useAppStore } from "@/store";

interface Command {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  icon?: typeof Settings;
  action: () => void;
}

interface Props {
  onClose: () => void;
}

export default function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const toggleSidePanel = useAppStore((s) => s.toggleSidePanel);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);
  const setSidePanelView = useAppStore((s) => s.setSidePanelView);
  const setTheme = useAppStore((s) => s.setTheme);
  const theme = useAppStore((s) => s.theme);

  const commands: Command[] = useMemo(() => [
    // View
    { id: "toggle-sidebar", label: "Toggle Sidebar", group: "View", shortcut: "⌘B", icon: PanelLeftClose, action: toggleSidePanel },
    { id: "toggle-terminal", label: "Toggle Terminal", group: "View", shortcut: "⌃`", icon: Terminal, action: toggleBottomPanel },
    { id: "toggle-ai", label: "Toggle AI Panel", group: "View", shortcut: "⌘L", icon: Sparkles, action: toggleAiPanel },
    { id: "show-explorer", label: "Show Explorer", group: "View", icon: Files, action: () => setSidePanelView("explorer") },
    { id: "show-search", label: "Show Search", group: "View", icon: Search, action: () => setSidePanelView("search") },
    { id: "show-git", label: "Show Source Control", group: "View", icon: GitBranch, action: () => setSidePanelView("git") },

    // Theme
    { id: "theme-dark", label: "Theme: Dark", group: "Preferences", icon: Moon, action: () => setTheme("dark") },
    { id: "theme-light", label: "Theme: Light", group: "Preferences", icon: Sun, action: () => setTheme("light") },
    { id: "theme-system", label: "Theme: System", group: "Preferences", icon: Palette, action: () => setTheme("system") },

    // Navigation
    { id: "open-settings", label: "Open Settings", group: "Navigate", shortcut: "⌘,", icon: Settings, action: () => navigate("/settings") },
    { id: "open-extensions", label: "Open Extensions", group: "Navigate", icon: Palette, action: () => navigate("/extensions") },

    // File
    { id: "new-chat", label: "New AI Chat", group: "AI", icon: SquarePen, action: toggleAiPanel },
  ], [toggleSidePanel, toggleBottomPanel, toggleAiPanel, setSidePanelView, setTheme, navigate]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => { setSelectedIdx(0); }, [filtered]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
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
      if (filtered[selectedIdx]) {
        filtered[selectedIdx].action();
        onClose();
      }
    }
  }

  // Group commands
  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      if (!map.has(cmd.group)) map.set(cmd.group, []);
      map.get(cmd.group)!.push(cmd);
    }
    return map;
  }, [filtered]);

  let globalIdx = 0;

  return (
    <div className="command-palette__backdrop" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="command-palette__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command…"
        />
        <div className="command-palette__results">
          {filtered.length === 0 && (
            <div className="command-palette__empty">No commands found</div>
          )}
          {Array.from(groups.entries()).map(([group, cmds]) => (
            <div key={group}>
              <div className="command-palette__group-label">{group}</div>
              {cmds.map((cmd) => {
                const idx = globalIdx++;
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    className={`command-palette__item ${idx === selectedIdx ? "command-palette__item--active" : ""}`}
                    onClick={() => { cmd.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    {Icon && <Icon />}
                    <span className="command-palette__item-label">{cmd.label}</span>
                    {cmd.shortcut && (
                      <span className="command-palette__item-shortcut">{cmd.shortcut}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
