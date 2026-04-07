import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Settings2, ChevronUp } from "lucide-react";
import { TerminalInstance, type SpawnConfig } from "@/ide/terminal/TerminalInstance";
import { AgentLogo } from "./agent-logos";
import { ALL_AGENTS, type AgentDef, type AgentSettings } from "./agent-settings";

// ── Saved session (persisted across app restarts) ─────────────────────────────

interface SavedSession {
  agentId: string;
  label: string;
  /** Captured from terminal output — used for precise per-session resume */
  sessionId?: string;
  savedAt: number;
}

function savedSessionsKey(workspacePath: string | null) {
  return `codrift:saved-sessions:${workspacePath ?? "global"}`;
}

function loadSavedSessions(workspacePath: string | null): SavedSession[] {
  try {
    const raw = localStorage.getItem(savedSessionsKey(workspacePath));
    if (!raw) return [];
    return JSON.parse(raw) as SavedSession[];
  } catch {
    return [];
  }
}

function persistSavedSessions(workspacePath: string | null, sessions: SavedSession[]) {
  localStorage.setItem(savedSessionsKey(workspacePath), JSON.stringify(sessions));
}

// ── Active session state ──────────────────────────────────────────────────────

interface AgentSession {
  termId: string;
  agentId: string;
  label: string;
  /** Passed to TerminalInstance so it creates the PTY at the correct pixel size. */
  spawn: SpawnConfig;
}

let sessionCounter = 0;

// Strip ANSI escape sequences so we can search plain text for session IDs
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

// Session ID patterns per agent:
//   Claude / Codex / Gemini : standard UUID  e.g. f38b6614-d740-4441-a123-0bb3bea0d6a9
//   OpenCode                : ULID with ses_ prefix  e.g. ses_01H2XCMQ3R9F7K4PVZWJ8DTNE5
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const OPENCODE_ULID_RE = /ses_[0-9A-Z]{26}/g;

// Try to extract a session ID from a chunk of terminal output.
// We look for a UUID / ULID near "session", "resume", or "continue" keywords.
function extractSessionId(chunk: string): string | null {
  const text = stripAnsi(chunk);
  const lower = text.toLowerCase();

  // OpenCode ULID (case-sensitive prefix, so search on original text)
  OPENCODE_ULID_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPENCODE_ULID_RE.exec(text)) !== null) {
    const ctx = lower.slice(Math.max(0, match.index - 60), match.index + 60);
    if (ctx.includes("session") || ctx.includes("resume") || ctx.includes("continue")) {
      return match[0];
    }
  }

  // Standard UUID (Claude, Codex, Gemini)
  UUID_RE.lastIndex = 0;
  while ((match = UUID_RE.exec(lower)) !== null) {
    const ctx = lower.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80);
    if (ctx.includes("session") || ctx.includes("resume") || ctx.includes("continue")) {
      return match[0];
    }
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  workspacePath: string | null;
  agentSettings: AgentSettings;
  onSettings: () => void;
}

export default function CliAgentPanel({ workspacePath, agentSettings, onSettings }: Props) {
  const [installedBinaries, setInstalledBinaries] = useState<string[]>([]);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeTermId, setActiveTermId] = useState<string | null>(null);
  const [renamingTermId, setRenamingTermId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const sessionCountsRef = useRef<Record<string, number>>({});
  const skillsRef = useRef<string>("");

  // Per-termId captured session IDs (from terminal output parsing)
  const [capturedIds, setCapturedIds] = useState<Record<string, string>>({});

  // Saved sessions from previous runs (persisted in localStorage)
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() =>
    loadSavedSessions(workspacePath),
  );

  // Stable refs for beforeunload save (avoids stale closures)
  const sessionsRef = useRef<AgentSession[]>(sessions);
  const capturedIdsRef = useRef<Record<string, string>>(capturedIds);
  const workspacePathRef = useRef<string | null>(workspacePath);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    capturedIdsRef.current = capturedIds;
  }, [capturedIds]);
  useEffect(() => {
    workspacePathRef.current = workspacePath;
  }, [workspacePath]);

  // Reload saved sessions if workspace changes
  useEffect(() => {
    setSavedSessions(loadSavedSessions(workspacePath));
  }, [workspacePath]);

  // Persist active sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length === 0) return;
    const toSave: SavedSession[] = sessions.map((s) => ({
      agentId: s.agentId,
      label: s.label,
      sessionId: capturedIds[s.termId],
      savedAt: Date.now(),
    }));
    persistSavedSessions(workspacePath, toSave);
  }, [sessions, capturedIds, workspacePath]);

  // Save on beforeunload (catches hard closes)
  useEffect(() => {
    const handleUnload = () => {
      const s = sessionsRef.current;
      if (s.length === 0) return;
      const toSave: SavedSession[] = s.map((sess) => ({
        agentId: sess.agentId,
        label: sess.label,
        sessionId: capturedIdsRef.current[sess.termId],
        savedAt: Date.now(),
      }));
      persistSavedSessions(workspacePathRef.current, toSave);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Detect which binaries are available in PATH
  useEffect(() => {
    const binaries = ALL_AGENTS.map((a) => a.binary);
    invoke<string[]>("which_cli", { names: binaries })
      .then(setInstalledBinaries)
      .catch(() => setInstalledBinaries(binaries)); // dev fallback: assume all
  }, []);

  // Load combined skills once — passed to agents that support --system-prompt
  useEffect(() => {
    invoke<string>("get_combined_skills")
      .then((s) => {
        skillsRef.current = s;
      })
      .catch(() => {});
  }, []);

  // Compute visible agents: enabled in settings AND (in PATH OR custom path specified)
  const visibleAgents = ALL_AGENTS.filter((agent) => {
    const cfg = agentSettings[agent.id];
    if (!cfg?.enabled) return false;
    if (cfg.customPath.trim()) return true; // custom path: trust it
    return installedBinaries.includes(agent.binary); // else must be in PATH
  });

  // Active session count per agentId (shown in hover tooltip)
  const sessionCounts = useMemo(
    () =>
      sessions.reduce<Record<string, number>>((acc, s) => {
        acc[s.agentId] = (acc[s.agentId] ?? 0) + 1;
        return acc;
      }, {}),
    [sessions],
  );

  function createSession(agent: AgentDef, cmd?: string[]) {
    sessionCounter++;
    const termId = `cli-agent-${Date.now()}-${sessionCounter}`;
    const agentCount = (sessionCountsRef.current[agent.id] ?? 0) + 1;
    sessionCountsRef.current[agent.id] = agentCount;
    const label = agentCount === 1 ? agent.label : `${agent.label} ${agentCount}`;

    const customPath = agentSettings[agent.id]?.customPath?.trim() || undefined;
    const resolvedCmd = cmd ?? agent.buildCmd({ customPath, skills: skillsRef.current });

    const spawn: SpawnConfig = { cmd: resolvedCmd, cwd: workspacePath };

    setSessions((prev) => [...prev, { termId, agentId: agent.id, label, spawn }]);
    setActiveTermId(termId);
  }

  function resumeSession(agent: AgentDef) {
    if (!agent.resumeCmd) return;
    const customPath = agentSettings[agent.id]?.customPath?.trim() || undefined;
    const cmd = agent.resumeCmd({ customPath });
    createSession(agent, cmd);
  }

  /** Resume a specific saved session using its captured session ID (if available). */
  function resumeSavedSession(saved: SavedSession) {
    const agent = ALL_AGENTS.find((a) => a.id === saved.agentId);
    if (!agent) return;

    const customPath = agentSettings[agent.id]?.customPath?.trim() || undefined;
    let cmd: string[];

    if (saved.sessionId) {
      // Each agent has its own syntax for resuming a specific session by ID
      if (agent.id === "claude") {
        cmd = [
          customPath || "claude",
          "--resume",
          saved.sessionId,
          "--dangerously-skip-permissions",
        ];
      } else if (agent.id === "codex") {
        cmd = [customPath || "codex", "resume", saved.sessionId];
      } else if (agent.id === "gemini") {
        cmd = [customPath || "gemini", "--resume", saved.sessionId];
      } else if (agent.id === "opencode") {
        cmd = [customPath || "opencode", "--session", saved.sessionId];
      } else {
        // Fallback: use generic resume (resumes last session)
        cmd = agent.resumeCmd?.({ customPath }) ?? agent.buildCmd({ customPath });
      }
    } else {
      // No captured ID — use the agent's generic resume command (resumes last session)
      cmd = agent.resumeCmd?.({ customPath }) ?? agent.buildCmd({ customPath });
    }

    createSession(agent, cmd);

    // Remove from saved sessions list
    setSavedSessions((prev) => {
      const next = prev.filter((s) => s !== saved);
      persistSavedSessions(workspacePath, next);
      return next;
    });
  }

  function dismissSavedSession(saved: SavedSession) {
    setSavedSessions((prev) => {
      const next = prev.filter((s) => s !== saved);
      persistSavedSessions(workspacePath, next);
      return next;
    });
  }

  /** Called with raw PTY output chunks; tries to extract a session ID. */
  function handleTermData(termId: string, agentId: string, chunk: string) {
    // Only attempt extraction for agents that support resume by session ID
    const supportsId = ["claude", "codex", "gemini", "opencode"].includes(agentId);
    if (!supportsId) return;
    // Skip if we already have a session ID for this terminal
    if (capturedIdsRef.current[termId]) return;

    const id = extractSessionId(chunk);
    if (id) {
      setCapturedIds((prev) => {
        if (prev[termId]) return prev;
        return { ...prev, [termId]: id };
      });
    }
  }

  function startRename(termId: string, currentLabel: string) {
    setActiveTermId(termId);
    setRenamingTermId(termId);
    setRenameValue(currentLabel);
    requestAnimationFrame(() => renameInputRef.current?.select());
  }

  function commitRename(termId: string) {
    const trimmed = renameValue.trim();
    if (trimmed) {
      setSessions((prev) => prev.map((s) => (s.termId === termId ? { ...s, label: trimmed } : s)));
    }
    setRenamingTermId(null);
  }

  async function closeSession(termId: string) {
    try {
      await invoke("terminal_close", { id: termId });
    } catch {}

    setSessions((prev) => {
      const remaining = prev.filter((s) => s.termId !== termId);
      if (activeTermId === termId) {
        setActiveTermId(remaining.at(-1)?.termId ?? null);
      }
      return remaining;
    });

    setCapturedIds((prev) => {
      const next = { ...prev };
      delete next[termId];
      return next;
    });
  }

  return (
    <div className="cli-agent-panel">
      {/* ── Header bar: agent launcher buttons ── */}
      <div className="cli-agent-panel__header">
        <div className="cli-agent-panel__agents">
          {visibleAgents.map((agent) => {
            const count = sessionCounts[agent.id] ?? 0;
            return (
              <div key={agent.id} className="cli-agent-panel__agent-group">
                <button
                  type="button"
                  className="cli-agent-panel__agent-btn"
                  onClick={() => createSession(agent)}
                >
                  <AgentLogo agentId={agent.id} size={12} className="cli-agent-panel__agent-logo" />
                  {agent.label}
                </button>
                {agent.resumeCmd && (
                  <button
                    type="button"
                    className="cli-agent-panel__resume-btn"
                    onClick={() => resumeSession(agent)}
                    title={`Resume previous ${agent.label} session`}
                  >
                    ↩
                  </button>
                )}
                {/* Hover tooltip: description + active session count */}
                <div className="cli-agent-panel__agent-tooltip">
                  <span className="cli-agent-panel__agent-tooltip-desc">{agent.description}</span>
                  {count > 0 && (
                    <span className="cli-agent-panel__agent-tooltip-count">
                      <ChevronUp size={9} />
                      {count}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {visibleAgents.length === 0 && (
            <span className="cli-agent-panel__no-agents">
              No agents enabled — open Settings to configure
            </span>
          )}
        </div>

        <div className="cli-agent-panel__header-right">
          <button
            type="button"
            className="cli-agent-panel__icon-btn"
            title="Settings"
            onClick={onSettings}
          >
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Session tabs ── */}
      {sessions.length > 0 && (
        <div className="cli-agent-panel__tabs">
          {sessions.map((s) => {
            const isActive = s.termId === activeTermId;
            const isRenaming = s.termId === renamingTermId;
            return (
              <div
                key={s.termId}
                className={`cli-agent-panel__tab${isActive ? " cli-agent-panel__tab--active" : ""}`}
                onClick={() => setActiveTermId(s.termId)}
              >
                <AgentLogo agentId={s.agentId} size={10} className="cli-agent-panel__tab-logo" />
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="cli-agent-panel__tab-rename"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename(s.termId);
                      }
                      if (e.key === "Escape") setRenamingTermId(null);
                    }}
                    onBlur={() => commitRename(s.termId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="cli-agent-panel__tab-label"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(s.termId, s.label);
                    }}
                  >
                    {s.label}
                  </span>
                )}
                <span
                  className="cli-agent-panel__tab-close"
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(s.termId);
                  }}
                >
                  <X size={9} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Terminal body ── */}
      <div className="cli-agent-panel__body">
        {sessions.length === 0 ? (
          <EmptyState
            agents={visibleAgents}
            savedSessions={savedSessions}
            onSettings={onSettings}
            onLaunch={(agent) => createSession(agent)}
            onResume={(agent) => resumeSession(agent)}
            onResumeSaved={resumeSavedSession}
            onDismissSaved={dismissSavedSession}
          />
        ) : (
          sessions.map((s) => (
            <div
              key={s.termId}
              className="cli-agent-panel__term-wrap"
              style={{ display: s.termId === activeTermId ? "flex" : "none" }}
            >
              <TerminalInstance
                id={s.termId}
                visible={s.termId === activeTermId}
                spawn={s.spawn}
                onData={(chunk) => handleTermData(s.termId, s.agentId, chunk)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({
  agents,
  savedSessions,
  onSettings,
  onLaunch,
  onResume,
  onResumeSaved,
  onDismissSaved,
}: {
  agents: AgentDef[];
  savedSessions: SavedSession[];
  onSettings: () => void;
  onLaunch: (agent: AgentDef) => void;
  onResume: (agent: AgentDef) => void;
  onResumeSaved: (saved: SavedSession) => void;
  onDismissSaved: (saved: SavedSession) => void;
}) {
  if (agents.length === 0) {
    return (
      <div className="cli-agent-panel__empty">
        <p className="cli-agent-panel__empty-title">No agents available</p>
        <p className="cli-agent-panel__empty-hint">
          Enable agents in Settings and make sure their CLI tools are installed.
        </p>
        <button type="button" className="cli-agent-panel__empty-settings-btn" onClick={onSettings}>
          <Settings2 size={13} />
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="cli-agent-panel__launcher">
      {/* ── Previous sessions ── */}
      {savedSessions.length > 0 && (
        <div className="cli-agent-panel__saved-sessions">
          <p className="cli-agent-panel__saved-heading">Previous sessions</p>
          {savedSessions.map((saved, i) => {
            const agent = ALL_AGENTS.find((a) => a.id === saved.agentId);
            return (
              <div key={i} className="cli-agent-panel__saved-row">
                <AgentLogo
                  agentId={saved.agentId}
                  size={12}
                  className="cli-agent-panel__saved-logo"
                />
                <span className="cli-agent-panel__saved-label">{saved.label}</span>
                {agent?.resumeCmd && (
                  <button
                    type="button"
                    className="cli-agent-panel__saved-btn cli-agent-panel__saved-btn--primary"
                    onClick={() => onResumeSaved(saved)}
                  >
                    ↩ Resume
                  </button>
                )}
                <button
                  type="button"
                  className="cli-agent-panel__saved-dismiss"
                  onClick={() => onDismissSaved(saved)}
                  title="Dismiss"
                >
                  <X size={9} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── New session launcher ── */}
      <p className="cli-agent-panel__launcher-heading">Start an agent session</p>
      <div className="cli-agent-panel__agent-rows">
        {agents.map((agent) => (
          <div key={agent.id} className="cli-agent-panel__agent-row">
            <AgentLogo agentId={agent.id} size={16} className="cli-agent-panel__agent-row-logo" />
            <span className="cli-agent-panel__agent-row-name">{agent.label}</span>
            <div className="cli-agent-panel__agent-row-actions">
              {agent.resumeCmd && (
                <button
                  type="button"
                  className="cli-agent-panel__agent-row-btn"
                  onClick={() => onResume(agent)}
                  title={`Resume previous ${agent.label} session`}
                >
                  ↩ Resume
                </button>
              )}
              <button
                type="button"
                className="cli-agent-panel__agent-row-btn cli-agent-panel__agent-row-btn--primary"
                onClick={() => onLaunch(agent)}
                title={`New ${agent.label} session`}
              >
                ▶ Start
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
