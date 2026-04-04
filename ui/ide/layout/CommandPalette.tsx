import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import {
  Settings,
  Sparkles,
  Terminal,
  Files,
  GitBranch,
  Search,
  Palette,
  SquarePen,
  PanelLeftClose,
  Sun,
  Moon,
  TerminalSquare,
  Clock,
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

// ── Recent commands ────────────────────────────────────────────────────────────
const RECENT_KEY = "blink:recent-commands";
const MAX_RECENT = 8;

function getRecentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function recordRecent(id: string) {
  const ids = [id, ...getRecentIds().filter((r) => r !== id)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
}

// ── Fuzzy scoring ─────────────────────────────────────────────────────────────

/**
 * Score how well `query` matches `text`.
 * Returns null if there is no match, or a score ≥ 0 (higher = better).
 *
 * Strategy:
 *   - All query chars must appear in text (in order) for a match
 *   - Consecutive runs and start-of-word matches score higher
 */
function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // Check all query chars are present in order
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti);
    if (found === -1) return null;
    ti = found + 1;
  }

  // Score: consecutive run bonus + start-of-word bonus
  let score = 0;
  let prevIdx = -1;
  let qi = 0;
  let ti2 = 0;
  while (qi < q.length) {
    const idx = t.indexOf(q[qi], ti2);
    if (idx === -1) break;
    // Consecutive bonus
    if (idx === prevIdx + 1) score += 4;
    // Start of word bonus
    if (idx === 0 || t[idx - 1] === " " || t[idx - 1] === "-" || t[idx - 1] === "_") score += 3;
    // Start of string
    if (idx === 0) score += 2;
    score += 1;
    prevIdx = idx;
    ti2 = idx + 1;
    qi++;
  }

  return score;
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

  const commands: Command[] = useMemo(
    () => [
      // View
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        group: "View",
        shortcut: "⌘B",
        icon: PanelLeftClose,
        action: toggleSidePanel,
      },
      {
        id: "toggle-terminal",
        label: "Toggle Terminal",
        group: "View",
        shortcut: "⌃`",
        icon: Terminal,
        action: toggleBottomPanel,
      },
      {
        id: "toggle-ai",
        label: "Toggle AI Panel",
        group: "View",
        shortcut: "⌘L",
        icon: Sparkles,
        action: toggleAiPanel,
      },
      {
        id: "show-explorer",
        label: "Show Explorer",
        group: "View",
        icon: Files,
        action: () => setSidePanelView("explorer"),
      },
      {
        id: "show-search",
        label: "Show Search",
        group: "View",
        icon: Search,
        action: () => setSidePanelView("search"),
      },
      {
        id: "show-git",
        label: "Show Source Control",
        group: "View",
        icon: GitBranch,
        action: () => setSidePanelView("git"),
      },

      // Theme
      {
        id: "theme-dark",
        label: "Theme: Dark",
        group: "Preferences",
        icon: Moon,
        action: () => setTheme("dark"),
      },
      {
        id: "theme-light",
        label: "Theme: Light",
        group: "Preferences",
        icon: Sun,
        action: () => setTheme("light"),
      },
      {
        id: "theme-system",
        label: "Theme: System",
        group: "Preferences",
        icon: Palette,
        action: () => setTheme("system"),
      },

      // Navigation
      {
        id: "open-settings",
        label: "Open Settings",
        group: "Navigate",
        shortcut: "⌘,",
        icon: Settings,
        action: () => navigate("/settings"),
      },

      // AI
      { id: "new-chat", label: "New AI Chat", group: "AI", icon: SquarePen, action: toggleAiPanel },
      {
        id: "inline-edit",
        label: "Inline Edit (select code first)",
        group: "AI",
        shortcut: "⌘K",
        icon: SquarePen,
        action: () => {},
      },

      // System
      {
        id: "install-cli",
        label: "Install CLI (blink command)",
        group: "System",
        icon: TerminalSquare,
        action: () => {
          invoke("install_cli")
            .then((msg) => alert(msg as string))
            .catch((err) => alert(`Failed: ${err}`));
        },
      },
    ],
    [toggleSidePanel, toggleBottomPanel, toggleAiPanel, setSidePanelView, setTheme, navigate],
  );

  // ── Filtered + scored list ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const recentIds = getRecentIds();
    if (!query.trim()) {
      // No query → show recent first, then all
      const recentCmds = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is Command => !!c);
      const rest = commands.filter((c) => !recentIds.includes(c.id));
      return [
        ...recentCmds.map((c) => ({ cmd: c, score: Infinity, isRecent: true })),
        ...rest.map((c) => ({ cmd: c, score: 0, isRecent: false })),
      ];
    }

    const q = query.trim();
    const scored: { cmd: Command; score: number; isRecent: boolean }[] = [];
    for (const cmd of commands) {
      const labelScore = fuzzyScore(cmd.label, q);
      const groupScore = fuzzyScore(cmd.group, q);
      const best = Math.max(labelScore ?? -1, groupScore ?? -1);
      if (best >= 0) {
        scored.push({ cmd, score: best, isRecent: false });
      }
    }
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [commands, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered]);
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
        recordRecent(item.cmd.id);
        item.cmd.action();
        onClose();
      }
    }
  }

  function runCommand(item: { cmd: Command }) {
    recordRecent(item.cmd.id);
    item.cmd.action();
    onClose();
  }

  // ── Group for display ─────────────────────────────────────────────────────
  const noQuery = !query.trim();

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const groupKey = noQuery && item.isRecent ? "Recent" : item.cmd.group;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(item);
    }
    // Ensure "Recent" is first
    if (map.has("Recent")) {
      const recent = map.get("Recent")!;
      map.delete("Recent");
      const ordered = new Map([["Recent", recent], ...map]);
      return ordered;
    }
    return map;
  }, [filtered, noQuery]);

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
          {filtered.length === 0 && <div className="command-palette__empty">No commands found</div>}
          {Array.from(groups.entries()).map(([group, items]) => (
            <div key={group}>
              <div className="command-palette__group-label">
                {group === "Recent" && <Clock size={10} style={{ marginRight: 4 }} />}
                {group}
              </div>
              {items.map((item) => {
                const idx = globalIdx++;
                const Icon = item.cmd.icon;
                return (
                  <button
                    key={item.cmd.id}
                    type="button"
                    className={`command-palette__item ${idx === selectedIdx ? "command-palette__item--active" : ""}`}
                    onClick={() => runCommand(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    {Icon && <Icon />}
                    <span className="command-palette__item-label">
                      {query ? (
                        <FuzzyHighlight text={item.cmd.label} query={query} />
                      ) : (
                        item.cmd.label
                      )}
                    </span>
                    {item.cmd.shortcut && (
                      <span className="command-palette__item-shortcut">{item.cmd.shortcut}</span>
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

// ── Fuzzy highlight ────────────────────────────────────────────────────────────
// Wraps matching characters in <mark> tags for visual feedback

function FuzzyHighlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const matchPositions = new Set<number>();

  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) break;
    matchPositions.add(idx);
    ti = idx + 1;
  }

  if (matchPositions.size === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  for (let i = 0; i < text.length; i++) {
    if (matchPositions.has(i)) {
      parts.push(
        <mark key={i} className="command-palette__match">
          {text[i]}
        </mark>,
      );
    } else {
      parts.push(text[i]);
    }
  }
  return <>{parts}</>;
}
