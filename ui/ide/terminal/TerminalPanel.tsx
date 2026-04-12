import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, X, Trash2, SplitSquareHorizontal, ChevronDown, Search, ChevronUp } from "lucide-react";
import { useAppStore } from "@/store";
import { TerminalInstance } from "./TerminalInstance";
import "@xterm/xterm/css/xterm.css";

// ── Terminal profiles ─────────────────────────────────────────────────────────

interface TerminalProfile {
  id: string;
  label: string;
  shell: string;
}

const BUILTIN_PROFILES: TerminalProfile[] = [
  { id: "default", label: "Default", shell: "" }, // empty = use $SHELL
  { id: "zsh", label: "zsh", shell: "/bin/zsh" },
  { id: "bash", label: "bash", shell: "/bin/bash" },
  { id: "sh", label: "sh", shell: "/bin/sh" },
  { id: "fish", label: "fish", shell: "/opt/homebrew/bin/fish" },
];

function loadProfile(): TerminalProfile {
  const stored = localStorage.getItem("codrift:terminal-profile");
  if (stored) {
    const found = BUILTIN_PROFILES.find((p) => p.id === stored);
    if (found) return found;
  }
  return BUILTIN_PROFILES[0];
}

let termCounter = 0;

export default function TerminalPanel() {
  const ws = useAppStore((s) => s.activeWorkspace());
  const addTerminalId = useAppStore((s) => s.addTerminalId);
  const removeTerminalId = useAppStore((s) => s.removeTerminalId);
  const setActiveTerminalId = useAppStore((s) => s.setActiveTerminalId);
  const createdRef = useRef(false);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<TerminalProfile>(loadProfile);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [terminalNames, setTerminalNames] = useState<Record<string, string>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const terminalIds = ws?.terminalIds ?? [];
  const activeTerminalId = ws?.activeTerminalId ?? null;
  const workspacePath = ws?.path || null;

  async function createSession(profileOverride?: TerminalProfile): Promise<string | null> {
    termCounter++;
    const id = `term-${Date.now()}-${termCounter}`;
    const profile = profileOverride ?? activeProfile;
    try {
      await invoke("terminal_create", {
        id,
        cwd: workspacePath,
        rows: 24,
        cols: 80,
        shell: profile.shell || null,
        command: null,
      });
      addTerminalId(id);
      return id;
    } catch (err) {
      console.error("Failed to create terminal:", err);
      return null;
    }
  }

  async function createNamedSession(
    name: string,
    command: string[],
    cwd?: string | null,
  ): Promise<string | null> {
    termCounter++;
    const id = `term-${Date.now()}-${termCounter}`;
    try {
      await invoke("terminal_create", {
        id,
        cwd: cwd ?? workspacePath,
        rows: 24,
        cols: 80,
        shell: null,
        command,
      });
      addTerminalId(id);
      setTerminalNames((prev) => ({ ...prev, [id]: name }));
      setActiveTerminalId(id);
      return id;
    } catch (err) {
      console.error("Failed to create named terminal:", err);
      return null;
    }
  }

  // Listen for CLI launch events from the AI panel
  useEffect(() => {
    function handler(e: Event) {
      const { name, command, cwd } = (
        e as CustomEvent<{ name: string; command: string[]; cwd: string | null }>
      ).detail;
      void createNamedSession(name, command, cwd);
    }
    document.addEventListener("blink:launch-cli-terminal", handler);
    return () => document.removeEventListener("blink:launch-cli-terminal", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    function handler(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  const dispatchSearch = useCallback((query: string, forward: boolean, clear = false) => {
    const targetId = splitId ?? activeTerminalId;
    if (!targetId) return;
    document.dispatchEvent(new CustomEvent(`terminal:search:${targetId}`, {
      detail: { query, forward, clear },
    }));
  }, [activeTerminalId, splitId]);

  // Ctrl+F to open terminal search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((v) => {
          if (!v) setTimeout(() => searchInputRef.current?.focus(), 50);
          // After toggle, trigger a fit so the terminal resizes to the new body height
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent("blink:terminal-refit"));
          }, 60);
          return !v;
        });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close search + clear decorations on Escape
  useEffect(() => {
    if (!searchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
        dispatchSearch("", true, true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, dispatchSearch]);

  async function closeSession(id: string) {
    try {
      await invoke("terminal_close", { id });
    } catch {}

    setTerminalNames((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const isLast = terminalIds.length <= 1;
    removeTerminalId(id);

    if (isLast) {
      useAppStore.getState().toggleBottomPanel();
    }
  }

  // Auto-create first terminal when panel opens with no sessions
  useEffect(() => {
    if (createdRef.current || terminalIds.length > 0) return;
    createdRef.current = true;
    createSession();
    return () => {
      createdRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  function getTermName(id: string, idx: number) {
    return terminalNames[id] ?? `Terminal ${idx + 1}`;
  }

  async function createSplit() {
    const id = await createSession();
    if (id) setSplitId(id);
  }

  function closeSplitPane() {
    setSplitId(null);
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-panel__header">
        <div className="terminal-panel__tabs">
          {terminalIds.map((id, idx) => (
            <button
              key={id}
              type="button"
              className={`terminal-panel__tab ${activeTerminalId === id ? "terminal-panel__tab--active" : ""}`}
              onClick={() => setActiveTerminalId(id)}
            >
              {getTermName(id, idx)}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(id);
                  if (splitId === id) setSplitId(null);
                }}
                style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
              >
                <X size={10} />
              </span>
            </button>
          ))}
        </div>
        <div className="terminal-panel__actions">
          {/* Profile picker */}
          <div className="terminal-panel__profile-wrap" ref={profileMenuRef}>
            <button
              type="button"
              className="terminal-panel__action terminal-panel__action--profile"
              title="New terminal with profile"
              onClick={() => setProfileMenuOpen((v) => !v)}
            >
              <Plus />
              <ChevronDown size={10} />
            </button>
            {profileMenuOpen && (
              <div className="terminal-panel__profile-menu">
                {BUILTIN_PROFILES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`terminal-panel__profile-item${p.id === activeProfile.id ? " terminal-panel__profile-item--active" : ""}`}
                    onClick={() => {
                      setActiveProfile(p);
                      localStorage.setItem("codrift:terminal-profile", p.id);
                      setProfileMenuOpen(false);
                      createSession(p);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="terminal-panel__action"
            onClick={() => createSession()}
            title="New Terminal"
          >
            <Plus />
          </button>
          <button
            type="button"
            className="terminal-panel__action"
            onClick={createSplit}
            title="Split Terminal"
          >
            <SplitSquareHorizontal />
          </button>
          <button
            type="button"
            className="terminal-panel__action"
            onClick={() => activeTerminalId && closeSession(activeTerminalId)}
            title="Kill Terminal"
          >
            <Trash2 />
          </button>
        </div>
      </div>
      {searchOpen && (
        <div className="terminal-panel__search">
          <Search size={13} />
          <input
            ref={searchInputRef}
            className="terminal-panel__search-input"
            type="text"
            placeholder="Search terminal…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              dispatchSearch(e.target.value, true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                dispatchSearch(searchQuery, !e.shiftKey);
              } else if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
                dispatchSearch("", true, true);
              }
            }}
          />
          <button type="button" className="terminal-panel__search-btn" title="Previous (Shift+Enter)" onClick={() => dispatchSearch(searchQuery, false)}>
            <ChevronUp size={13} />
          </button>
          <button type="button" className="terminal-panel__search-btn" title="Next (Enter)" onClick={() => dispatchSearch(searchQuery, true)}>
            <ChevronDown size={13} />
          </button>
          <button type="button" className="terminal-panel__search-btn" title="Close" onClick={() => { setSearchOpen(false); setSearchQuery(""); dispatchSearch("", true, true); }}>
            <X size={13} />
          </button>
        </div>
      )}
      <div className={`terminal-panel__body${splitId ? " terminal-panel__body--split" : ""}`}>
        {/* Primary pane */}
        <div className="terminal-pane-wrap">
          {terminalIds.map((id) => {
            const isActive = activeTerminalId === id && id !== splitId;
            return (
              <div
                key={id}
                className="terminal-instance-wrap"
                style={{ display: isActive ? "flex" : "none" }}
              >
                <TerminalInstance id={id} visible={isActive} />
              </div>
            );
          })}
        </div>
        {/* Split pane */}
        {splitId && (
          <>
            <div className="terminal-split-divider" />
            <div className="terminal-pane-wrap" style={{ position: "relative" }}>
              <button
                type="button"
                onClick={closeSplitPane}
                title="Close Split"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  zIndex: 10,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--c-muted-fg)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={12} />
              </button>
              <div className="terminal-instance-wrap" style={{ display: "flex" }}>
                <TerminalInstance id={splitId} visible />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
