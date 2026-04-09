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
  if (sessions.length === 0) {
    localStorage.removeItem(savedSessionsKey(workspacePath));
  } else {
    localStorage.setItem(savedSessionsKey(workspacePath), JSON.stringify(sessions));
  }
}

// ── Active session state ──────────────────────────────────────────────────────

interface AgentSession {
  termId: string;
  agentId: string;
  label: string;
  spawn: SpawnConfig;
  // Workspace this session belongs to.  Sessions are scoped per workspace:
  // switching workspaces shows only that workspace's sessions, but all PTYs
  // stay alive (mounted with display: none) so work isn't lost on switch.
  workspacePath: string | null;
}

let sessionCounter = 0;

// ── Session ID extraction from terminal output ────────────────────────────────

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

// Claude/Codex/Gemini: standard UUID   e.g. f38b6614-d740-4441-a123-0bb3bea0d6a9
// OpenCode: ULID with ses_ prefix      e.g. ses_01H2XCMQ3R9F7K4PVZWJ8DTNE5
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const OPENCODE_ULID_RE = /ses_[0-9A-Z]{26}/g;

function extractSessionId(chunk: string): string | null {
  const text = stripAnsi(chunk);
  const lower = text.toLowerCase();
  let match: RegExpExecArray | null;

  OPENCODE_ULID_RE.lastIndex = 0;
  while ((match = OPENCODE_ULID_RE.exec(text)) !== null) {
    const ctx = lower.slice(Math.max(0, match.index - 60), match.index + 60);
    if (ctx.includes("session") || ctx.includes("resume") || ctx.includes("continue")) {
      return match[0];
    }
  }

  UUID_RE.lastIndex = 0;
  while ((match = UUID_RE.exec(lower)) !== null) {
    const ctx = lower.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80);
    if (ctx.includes("session") || ctx.includes("resume") || ctx.includes("continue")) {
      return match[0];
    }
  }

  return null;
}

// ── Build the resume command for a specific saved session ─────────────────────

function buildSavedSessionCmd(
  saved: SavedSession,
  agentSettings: AgentSettings,
  resolvedPaths: Record<string, string>,
): string[] | null {
  const agent = ALL_AGENTS.find((a) => a.id === saved.agentId);
  if (!agent) return null;
  // Priority: customPath > absolute path from which > bare binary name.
  // Using the absolute path bypasses shell wrappers (e.g. cmux's claude fn).
  const customPathSetting = agentSettings[agent.id]?.customPath?.trim();
  const exe = customPathSetting || resolvedPaths[agent.binary] || agent.binary;

  if (saved.sessionId) {
    // Resume the exact session by ID
    if (agent.id === "claude") {
      return [exe, "--resume", saved.sessionId, "--dangerously-skip-permissions"];
    }
    if (agent.id === "codex") {
      return [exe, "resume", saved.sessionId];
    }
    if (agent.id === "gemini") {
      return [exe, "--resume", saved.sessionId];
    }
    if (agent.id === "opencode") {
      return [exe, "--session", saved.sessionId];
    }
  }

  // No captured ID — continue the most-recent session silently (no picker)
  if (agent.id === "claude") {
    return [exe, "--continue", "--dangerously-skip-permissions"];
  }
  if (agent.id === "codex") {
    return [exe, "resume", "--last"];
  }
  if (agent.id === "gemini") {
    return [exe, "--resume"];
  }
  if (agent.id === "opencode") {
    return [exe, "--continue"];
  }

  return agent.buildCmd({ customPath: exe });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  workspacePath: string | null;
  agentSettings: AgentSettings;
  onSettings: () => void;
}

export default function CliAgentPanel({ workspacePath, agentSettings, onSettings }: Props) {
  // Map of binary name -> absolute path (as resolved by `/usr/bin/which`).
  // Using the absolute path when spawning bypasses shell functions and aliases
  // like cmux's `claude() { "$_CMUX_CLAUDE_WRAPPER" "$@"; }`.
  const [installedBinaries, setInstalledBinaries] = useState<Record<string, string>>({});
  // All sessions across ALL workspaces live in one array and stay mounted.
  // We filter by workspacePath in the render to show only the active workspace's
  // sessions — the inactive ones remain in the DOM with display:none so their
  // PTYs, xterm buffers, and listeners survive workspace switches.
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  // activeTermId is stored per workspace path ("" as key for null workspace).
  const [activeTermByWs, setActiveTermByWs] = useState<Record<string, string | null>>({});
  const [renamingTermId, setRenamingTermId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Per-workspace session counter so "Claude 2" doesn't bleed across workspaces
  const sessionCountsRef = useRef<Record<string, Record<string, number>>>({});
  const skillsRef = useRef<string>("");

  const wsKey = (p: string | null) => p ?? "";
  const activeTermId = activeTermByWs[wsKey(workspacePath)] ?? null;

  // Per-termId captured session IDs (from terminal output parsing)
  const [capturedIds, setCapturedIds] = useState<Record<string, string>>({});

  // Stable refs for beforeunload save and async effect closures
  const sessionsRef = useRef<AgentSession[]>(sessions);
  const capturedIdsRef = useRef<Record<string, string>>(capturedIds);
  const workspacePathRef = useRef<string | null>(workspacePath);
  const agentSettingsRef = useRef<AgentSettings>(agentSettings);
  const installedBinariesRef = useRef<Record<string, string>>({});
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { capturedIdsRef.current = capturedIds; }, [capturedIds]);
  useEffect(() => { workspacePathRef.current = workspacePath; }, [workspacePath]);
  useEffect(() => { agentSettingsRef.current = agentSettings; }, [agentSettings]);
  useEffect(() => { installedBinariesRef.current = installedBinaries; }, [installedBinaries]);

  // ── Auto-resume saved sessions per workspace ─────────────────────────────────
  // Each workspace auto-resumes its sessions the first time it becomes active.
  // Switching between workspaces does not kill sessions — they stay mounted.
  // When a workspace first becomes active, we load its saved sessions from
  // localStorage and recreate them.  We track which workspaces have already
  // been resumed so switching back doesn't duplicate sessions.
  const resumedWorkspacesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (workspacePath === null) return; // workspace still loading — wait
    if (resumedWorkspacesRef.current.has(workspacePath)) return;
    resumedWorkspacesRef.current.add(workspacePath);

    const saved = loadSavedSessions(workspacePath);
    if (saved.length === 0) return;

    // Clear immediately so a crash-loop can't keep re-spawning
    persistSavedSessions(workspacePath, []);

    // Stagger starts so PTYs don't all race at once
    saved.forEach((s, i) => {
      setTimeout(() => {
        const agent = ALL_AGENTS.find((a) => a.id === s.agentId);
        if (!agent) return;
        const cmd = buildSavedSessionCmd(s, agentSettingsRef.current, installedBinariesRef.current);
        if (!cmd) return;
        // Capture the workspacePath at spawn time so the session is scoped
        // to the workspace it's resuming in, not whatever is active 200ms later.
        createSessionDirect(agent, cmd, s.label, workspacePath);
      }, i * 200);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  // ── Persist active sessions to localStorage whenever they change ─────────────
  // Group sessions by their own workspacePath, not the currently active one,
  // so workspace A's sessions get saved to A's key even while the user is
  // looking at workspace B.
  useEffect(() => {
    // Build a map of workspacePath -> SavedSession[] for every workspace that
    // currently has any sessions OR has been resumed (so we correctly clear
    // workspaces whose sessions were all closed).
    const grouped = new Map<string | null, SavedSession[]>();
    for (const wsPath of resumedWorkspacesRef.current) {
      grouped.set(wsPath, []);
    }
    for (const s of sessions) {
      const entry: SavedSession = {
        agentId: s.agentId,
        label: s.label,
        sessionId: capturedIds[s.termId],
        savedAt: Date.now(),
      };
      const list = grouped.get(s.workspacePath) ?? [];
      list.push(entry);
      grouped.set(s.workspacePath, list);
    }
    for (const [wsPath, list] of grouped) {
      persistSavedSessions(wsPath, list);
    }
  }, [sessions, capturedIds]);

  // Save on beforeunload (catches hard closes before React can unmount)
  useEffect(() => {
    const save = () => {
      const all = sessionsRef.current;
      if (all.length === 0) return;
      // Group by each session's own workspacePath
      const grouped = new Map<string | null, SavedSession[]>();
      for (const sess of all) {
        const entry: SavedSession = {
          agentId: sess.agentId,
          label: sess.label,
          sessionId: capturedIdsRef.current[sess.termId],
          savedAt: Date.now(),
        };
        const list = grouped.get(sess.workspacePath) ?? [];
        list.push(entry);
        grouped.set(sess.workspacePath, list);
      }
      for (const [wsPath, list] of grouped) {
        persistSavedSessions(wsPath, list);
      }
    };
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, []);

  // Detect which binaries are available in PATH
  useEffect(() => {
    const binaries = ALL_AGENTS.map((a) => a.binary);
    invoke<Record<string, string>>("which_cli", { names: binaries })
      .then(setInstalledBinaries)
      .catch(() => {
        // Fallback: mark all as "installed" with their bare name so the UI
        // doesn't vanish if the detection fails for some reason.
        const fallback: Record<string, string> = {};
        for (const b of binaries) fallback[b] = b;
        setInstalledBinaries(fallback);
      });
  }, []);

  // Load combined skills once
  useEffect(() => {
    invoke<string>("get_combined_skills")
      .then((s) => { skillsRef.current = s; })
      .catch(() => {});
  }, []);

  // Compute visible agents
  const visibleAgents = ALL_AGENTS.filter((agent) => {
    const cfg = agentSettings[agent.id];
    if (!cfg?.enabled) return false;
    if (cfg.customPath.trim()) return true;
    return agent.binary in installedBinaries;
  });

  /**
   * Pick the best path for an agent's binary.
   * Priority: user's customPath > resolved absolute path from which > bare name.
   * Using the absolute path here bypasses shell functions/aliases that may
   * shadow the real binary in the user's interactive shell (e.g. cmux).
   */
  function resolveAgentPath(agent: AgentDef): string {
    const custom = agentSettings[agent.id]?.customPath?.trim();
    if (custom) return custom;
    return installedBinaries[agent.binary] || agent.binary;
  }

  // Sessions visible in the CURRENT workspace only — used for UI tab list,
  // session counts, empty-state detection, etc.
  const visibleSessions = useMemo(
    () => sessions.filter((s) => s.workspacePath === workspacePath),
    [sessions, workspacePath],
  );

  // Active session count per agentId IN THE CURRENT WORKSPACE (for tooltip badge)
  const sessionCounts = useMemo(
    () =>
      visibleSessions.reduce<Record<string, number>>((acc, s) => {
        acc[s.agentId] = (acc[s.agentId] ?? 0) + 1;
        return acc;
      }, {}),
    [visibleSessions],
  );

  // ── Session management ───────────────────────────────────────────────────────

  /**
   * Core session creator — label can be overridden (for auto-resumed sessions).
   * wsPathOverride pins the session to a specific workspace at spawn time so
   * auto-resume (which uses setTimeout) doesn't accidentally attach a session
   * to whatever workspace is active 200ms later.
   */
  function createSessionDirect(
    agent: AgentDef,
    cmd: string[],
    labelOverride?: string,
    wsPathOverride?: string | null,
  ) {
    sessionCounter++;
    const termId = `cli-agent-${Date.now()}-${sessionCounter}`;
    const wsPath = wsPathOverride !== undefined ? wsPathOverride : workspacePath;
    const wsKeyStr = wsKey(wsPath);

    // Per-workspace counter so "Claude 2" doesn't bleed across workspaces.
    const wsCounts = (sessionCountsRef.current[wsKeyStr] ??= {});
    const agentCount = (wsCounts[agent.id] ?? 0) + 1;
    wsCounts[agent.id] = agentCount;

    const label = labelOverride ?? (agentCount === 1 ? agent.label : `${agent.label} ${agentCount}`);
    const spawn: SpawnConfig = { cmd, cwd: wsPath };
    setSessions((prev) => [...prev, { termId, agentId: agent.id, label, spawn, workspacePath: wsPath }]);
    setActiveTermByWs((prev) => ({ ...prev, [wsKeyStr]: termId }));
  }

  /** Start a fresh session (new chat) in the currently active workspace. */
  function createSession(agent: AgentDef) {
    // Pass the resolved absolute path as customPath so buildCmd uses it as the
    // first argv entry, bypassing shell wrappers (see resolveAgentPath above).
    const customPath = resolveAgentPath(agent);
    const cmd = agent.buildCmd({ customPath, skills: skillsRef.current });
    createSessionDirect(agent, cmd);
  }

  /**
   * ↩ Resume button in the header — opens the agent's interactive session picker
   * (no specific session ID, so the agent presents its own list of past sessions).
   */
  function resumeSession(agent: AgentDef) {
    if (!agent.resumeCmd) return;
    const customPath = resolveAgentPath(agent);
    createSessionDirect(agent, agent.resumeCmd({ customPath }));
  }

  /** Called with raw PTY output chunks; tries to capture a session ID. */
  function handleTermData(termId: string, agentId: string, chunk: string) {
    if (!["claude", "codex", "gemini", "opencode"].includes(agentId)) return;
    if (capturedIdsRef.current[termId]) return;
    const id = extractSessionId(chunk);
    if (id) {
      setCapturedIds((prev) => (prev[termId] ? prev : { ...prev, [termId]: id }));
    }
  }

  /** Select a session, updating the active termId for its own workspace. */
  function selectSession(s: AgentSession) {
    setActiveTermByWs((prev) => ({ ...prev, [wsKey(s.workspacePath)]: s.termId }));
  }

  function startRename(s: AgentSession) {
    selectSession(s);
    setRenamingTermId(s.termId);
    setRenameValue(s.label);
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
    try { await invoke("terminal_close", { id: termId }); } catch {}
    const closing = sessionsRef.current.find((s) => s.termId === termId);
    setSessions((prev) => prev.filter((s) => s.termId !== termId));
    if (closing) {
      // Pick a new active session for the closing session's workspace only.
      setActiveTermByWs((prev) => {
        const k = wsKey(closing.workspacePath);
        if (prev[k] !== termId) return prev;
        const remaining = sessionsRef.current.filter(
          (s) => s.termId !== termId && s.workspacePath === closing.workspacePath,
        );
        return { ...prev, [k]: remaining.at(-1)?.termId ?? null };
      });
    }
    setCapturedIds((prev) => {
      const next = { ...prev };
      delete next[termId];
      return next;
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="cli-agent-panel">
      {/* ── Header: agent launcher + resume buttons ── */}
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
                    title={`Open ${agent.label} session picker`}
                  >
                    ↩
                  </button>
                )}
                {/* Hover tooltip */}
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

      {/* ── Session tabs (current workspace only) ── */}
      {visibleSessions.length > 0 && (
        <div className="cli-agent-panel__tabs">
          {visibleSessions.map((s) => {
            const isActive = s.termId === activeTermId;
            const isRenaming = s.termId === renamingTermId;
            return (
              <div
                key={s.termId}
                className={`cli-agent-panel__tab${isActive ? " cli-agent-panel__tab--active" : ""}`}
                onClick={() => selectSession(s)}
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
                      if (e.key === "Enter") { e.preventDefault(); commitRename(s.termId); }
                      if (e.key === "Escape") setRenamingTermId(null);
                    }}
                    onBlur={() => commitRename(s.termId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="cli-agent-panel__tab-label"
                    onDoubleClick={(e) => { e.stopPropagation(); startRename(s); }}
                  >
                    {s.label}
                  </span>
                )}
                <span
                  className="cli-agent-panel__tab-close"
                  role="button"
                  onClick={(e) => { e.stopPropagation(); closeSession(s.termId); }}
                >
                  <X size={9} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Terminal body ──
          We render EVERY session across all workspaces so their xterm state
          and backing PTYs survive workspace switches.  Only the active
          workspace's currently-selected session is actually visible. */}
      <div className="cli-agent-panel__body">
        {visibleSessions.length === 0 && (
          <EmptyState
            agents={visibleAgents}
            onSettings={onSettings}
            onLaunch={createSession}
            onResume={resumeSession}
          />
        )}
        {sessions.map((s) => {
          const isInActiveWorkspace = s.workspacePath === workspacePath;
          const isVisibleTab = isInActiveWorkspace && s.termId === activeTermId;
          return (
            <div
              key={s.termId}
              className="cli-agent-panel__term-wrap"
              style={{ display: isVisibleTab ? "flex" : "none" }}
            >
              <TerminalInstance
                id={s.termId}
                visible={isVisibleTab}
                spawn={s.spawn}
                onData={(chunk) => handleTermData(s.termId, s.agentId, chunk)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({
  agents,
  onSettings,
  onLaunch,
  onResume,
}: {
  agents: AgentDef[];
  onSettings: () => void;
  onLaunch: (agent: AgentDef) => void;
  onResume: (agent: AgentDef) => void;
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
                  title={`Open ${agent.label} session picker`}
                >
                  ↩ Resume
                </button>
              )}
              <button
                type="button"
                className="cli-agent-panel__agent-row-btn cli-agent-panel__agent-row-btn--primary"
                onClick={() => onLaunch(agent)}
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
