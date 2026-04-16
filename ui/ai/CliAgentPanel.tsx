import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Settings2, ChevronUp, History, Search, Pencil, Trash2 } from "lucide-react";
import { VTermCanvas, type VTermSpawnConfig } from "@/ide/terminal/VTermCanvas";
import { AgentLogo } from "./agent-logos";
import { ALL_AGENTS, type AgentDef, type AgentSettings } from "./agent-settings";

// ── Saved session (persisted across app restarts — auto-resume) ───────────────

interface SavedSession {
  agentId: string;
  label: string;
  /** Captured from terminal output — used for precise per-session resume */
  sessionId?: string;
  savedAt: number;
}

// chatId scopes storage keys so each Builder chat has isolated history.
// When chatId is omitted (Editor mode AI panel), behaviour is unchanged.
function savedSessionsKey(workspacePath: string | null, chatId?: string | null) {
  const base = workspacePath ?? "global";
  return chatId ? `codrift:saved-sessions:${base}:${chatId}` : `codrift:saved-sessions:${base}`;
}

function loadSavedSessions(workspacePath: string | null, chatId?: string | null): SavedSession[] {
  try {
    const raw = localStorage.getItem(savedSessionsKey(workspacePath, chatId));
    if (!raw) return [];
    return JSON.parse(raw) as SavedSession[];
  } catch {
    return [];
  }
}

function persistSavedSessions(workspacePath: string | null, sessions: SavedSession[], chatId?: string | null) {
  if (sessions.length === 0) {
    localStorage.removeItem(savedSessionsKey(workspacePath, chatId));
  } else {
    localStorage.setItem(savedSessionsKey(workspacePath, chatId), JSON.stringify(sessions));
  }
}

// ── Session history (accumulated — never auto-cleared, shown in the drawer) ───

interface HistoryEntry {
  id: string;
  agentId: string;
  label: string;
  sessionId?: string;
  savedAt: number;
}

const HISTORY_MAX = 100;

function historyKey(workspacePath: string | null, chatId?: string | null) {
  const base = workspacePath ?? "global";
  return chatId ? `codrift:agent-history:${base}:${chatId}` : `codrift:agent-history:${base}`;
}

function loadHistory(workspacePath: string | null, chatId?: string | null): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(workspacePath, chatId));
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function persistHistory(workspacePath: string | null, entries: HistoryEntry[], chatId?: string | null) {
  const trimmed = entries.slice(0, HISTORY_MAX);
  if (trimmed.length === 0) {
    localStorage.removeItem(historyKey(workspacePath, chatId));
  } else {
    localStorage.setItem(historyKey(workspacePath, chatId), JSON.stringify(trimmed));
  }
}

function upsertHistory(
  workspacePath: string | null,
  entry: Omit<HistoryEntry, "id">,
  existingId?: string,
  chatId?: string | null,
): HistoryEntry[] {
  const existing = loadHistory(workspacePath, chatId);
  if (existingId) {
    // Update in-place (rename or sessionId capture), keeping position
    const updated = existing.map((e) =>
      e.id === existingId ? { ...e, ...entry, id: existingId } : e,
    );
    if (updated.some((e) => e.id === existingId)) {
      persistHistory(workspacePath, updated, chatId);
      return updated;
    }
  }
  const id = `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next = [{ ...entry, id }, ...existing].slice(0, HISTORY_MAX);
  persistHistory(workspacePath, next, chatId);
  return next;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

// ── Active session state ──────────────────────────────────────────────────────

interface AgentSession {
  termId: string;
  agentId: string;
  label: string;
  spawn: VTermSpawnConfig;
  workspacePath: string | null;
  /** History entry ID linked to this active session */
  historyId?: string;
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

// ── Build the resume command for a specific saved/history session ──────────────

function buildSavedSessionCmd(
  saved: SavedSession | HistoryEntry,
  agentSettings: AgentSettings,
  resolvedPaths: Record<string, string>,
): string[] | null {
  const agent = ALL_AGENTS.find((a) => a.id === saved.agentId);
  if (!agent) return null;
  const customPathSetting = agentSettings[agent.id]?.customPath?.trim();
  const exe = customPathSetting || resolvedPaths[agent.binary] || agent.binary;

  if (saved.sessionId) {
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
  /** Scopes all localStorage keys to this chat — each Builder chat gets isolated history. */
  chatId?: string | null;
  agentSettings: AgentSettings;
  onSettings: () => void;
  /** Called when the streaming/active state changes — used by Builder for chat tab badges. */
  onStreamingChange?: (streaming: boolean) => void;
}

export default function CliAgentPanel({ workspacePath, chatId, agentSettings, onSettings, onStreamingChange }: Props) {
  const [installedBinaries, setInstalledBinaries] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeTermByWs, setActiveTermByWs] = useState<Record<string, string | null>>({});
  const [renamingTermId, setRenamingTermId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const sessionCountsRef = useRef<Record<string, Record<string, number>>>({});
  const skillsRef = useRef<string>("");

  // Session history drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [renamingHistoryId, setRenamingHistoryId] = useState<string | null>(null);
  const [historyRenameValue, setHistoryRenameValue] = useState("");
  const historySearchRef = useRef<HTMLInputElement>(null);
  const historyRenameRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const wsKey = (p: string | null) => p ?? "";
  // Prefer the session pinned to the current workspace, but fall back to the
  // most-recently-created session so sessions from other workspaces stay
  // visible while you work in a different workspace.
  const activeTermId =
    activeTermByWs[wsKey(workspacePath)] ??
    (sessions.length > 0 ? sessions[sessions.length - 1].termId : null);

  const [capturedIds, setCapturedIds] = useState<Record<string, string>>({});

  const sessionsRef = useRef<AgentSession[]>(sessions);
  const capturedIdsRef = useRef<Record<string, string>>(capturedIds);
  const workspacePathRef = useRef<string | null>(workspacePath);
  const agentSettingsRef = useRef<AgentSettings>(agentSettings);
  const installedBinariesRef = useRef<Record<string, string>>({});
  // Keep onStreamingChange in a ref so changing it (e.g. inline arrow in
  // BuilderLayout) doesn't re-run the notification effect and cause an
  // infinite render loop.
  const onStreamingChangeRef = useRef(onStreamingChange);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { capturedIdsRef.current = capturedIds; }, [capturedIds]);
  useEffect(() => { workspacePathRef.current = workspacePath; }, [workspacePath]);
  useEffect(() => { agentSettingsRef.current = agentSettings; }, [agentSettings]);
  useEffect(() => { onStreamingChangeRef.current = onStreamingChange; }, [onStreamingChange]);

  // Notify parent when active session count changes (used for Builder chat tab badges)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    onStreamingChangeRef.current?.(sessions.length > 0);
  }, [sessions.length]); // intentionally omits onStreamingChange — use ref above
  useEffect(() => { installedBinariesRef.current = installedBinaries; }, [installedBinaries]);

  // Load history when workspace or chat changes, or drawer opens
  useEffect(() => {
    setHistoryEntries(loadHistory(workspacePath, chatId));
  }, [workspacePath, chatId]);

  // Close history drawer on outside click
  useEffect(() => {
    if (!historyOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHistoryOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [historyOpen]);

  // Focus search when drawer opens
  useEffect(() => {
    if (historyOpen) {
      setHistorySearch("");
      requestAnimationFrame(() => historySearchRef.current?.focus());
    }
  }, [historyOpen]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingHistoryId) {
      requestAnimationFrame(() => {
        historyRenameRef.current?.select();
      });
    }
  }, [renamingHistoryId]);

  // ── Auto-resume saved sessions per workspace+chat ────────────────────────────
  const resumedWorkspacesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (workspacePath === null) return;
    // Use workspace+chat as the resume key so each chat resumes independently
    const resumeKey = chatId ? `${workspacePath}:${chatId}` : workspacePath;
    if (resumedWorkspacesRef.current.has(resumeKey)) return;
    resumedWorkspacesRef.current.add(resumeKey);

    const saved = loadSavedSessions(workspacePath, chatId);
    if (saved.length === 0) return;

    persistSavedSessions(workspacePath, [], chatId);

    saved.forEach((s, i) => {
      setTimeout(() => {
        const agent = ALL_AGENTS.find((a) => a.id === s.agentId);
        if (!agent) return;
        const cmd = buildSavedSessionCmd(s, agentSettingsRef.current, installedBinariesRef.current);
        if (!cmd) return;
        createSessionDirect(agent, cmd, s.label, workspacePath);
      }, i * 200);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath, chatId]);

  // ── Persist active sessions to localStorage whenever they change ─────────────
  useEffect(() => {
    const grouped = new Map<string | null, SavedSession[]>();
    for (const resumeKey of resumedWorkspacesRef.current) {
      // resumeKey may be "wsPath:chatId" or just "wsPath" — extract workspace part
      const wsPath = chatId ? resumeKey.replace(`:${chatId}`, "") : resumeKey;
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
      persistSavedSessions(wsPath, list, chatId);
    }
  }, [sessions, capturedIds, chatId]);

  // Save on beforeunload — also push current sessions into history
  useEffect(() => {
    const save = () => {
      const all = sessionsRef.current;
      if (all.length === 0) return;
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
        persistSavedSessions(wsPath, list, chatId);
        // Also push into history so they appear in the drawer after restart
        let hist = loadHistory(wsPath, chatId);
        for (const s of list) {
          // Upsert by historyId if we have one, else add new
          const linked = all.find(
            (a) => a.workspacePath === wsPath && a.agentId === s.agentId && a.label === s.label,
          );
          hist = upsertHistory(wsPath, { agentId: s.agentId, label: s.label, sessionId: s.sessionId, savedAt: s.savedAt }, linked?.historyId, chatId);
        }
        void hist; // already persisted by upsertHistory
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
        const fallback: Record<string, string> = {};
        for (const b of binaries) fallback[b] = b;
        setInstalledBinaries(fallback);
      });
  }, []);

  useEffect(() => {
    invoke<string>("get_combined_skills")
      .then((s) => { skillsRef.current = s; })
      .catch(() => {});
  }, []);

  const visibleAgents = ALL_AGENTS.filter((agent) => {
    const cfg = agentSettings[agent.id];
    if (!cfg?.enabled) return false;
    if (cfg.customPath.trim()) return true;
    return agent.binary in installedBinaries;
  });

  function resolveAgentPath(agent: AgentDef): string {
    const custom = agentSettings[agent.id]?.customPath?.trim();
    if (custom) return custom;
    return installedBinaries[agent.binary] || agent.binary;
  }

  // Show ALL sessions regardless of workspace — sessions survive workspace
  // switches because each VTermCanvas stays mounted (PTY alive, CSS-hidden).
  // Filtering by workspacePath previously made them disappear from view,
  // which the user experienced as the session being "killed".
  const visibleSessions = sessions;

  const sessionCounts = useMemo(
    () =>
      visibleSessions.reduce<Record<string, number>>((acc, s) => {
        acc[s.agentId] = (acc[s.agentId] ?? 0) + 1;
        return acc;
      }, {}),
    [visibleSessions],
  );

  // ── Session management ───────────────────────────────────────────────────────

  function createSessionDirect(
    agent: AgentDef,
    cmd: string[],
    labelOverride?: string,
    wsPathOverride?: string | null,
    historyId?: string,
  ) {
    sessionCounter++;
    const termId = `cli-agent-${Date.now()}-${sessionCounter}`;
    const wsPath = wsPathOverride !== undefined ? wsPathOverride : workspacePath;
    const wsKeyStr = wsKey(wsPath);

    const wsCounts = (sessionCountsRef.current[wsKeyStr] ??= {});
    const agentCount = (wsCounts[agent.id] ?? 0) + 1;
    wsCounts[agent.id] = agentCount;

    const label = labelOverride ?? (agentCount === 1 ? agent.label : `${agent.label} ${agentCount}`);
    const spawn: VTermSpawnConfig = { cmd, cwd: wsPath };

    // If no historyId provided, add a new history entry for this session
    let hId = historyId;
    if (!hId) {
      const newHist = upsertHistory(wsPath, {
        agentId: agent.id,
        label,
        savedAt: Date.now(),
      }, undefined, chatId);
      hId = newHist[0]?.id;
      setHistoryEntries(newHist);
    }

    setSessions((prev) => [...prev, { termId, agentId: agent.id, label, spawn, workspacePath: wsPath, historyId: hId }]);
    setActiveTermByWs((prev) => ({ ...prev, [wsKeyStr]: termId }));
  }

  function createSession(agent: AgentDef) {
    const customPath = resolveAgentPath(agent);
    const cmd = agent.buildCmd({ customPath, skills: skillsRef.current });
    createSessionDirect(agent, cmd);
  }

  function resumeSession(agent: AgentDef) {
    if (!agent.resumeCmd) return;
    const customPath = resolveAgentPath(agent);
    createSessionDirect(agent, agent.resumeCmd({ customPath }));
  }

  /** Resume a specific history entry — opens it in a new terminal tab. */
  function resumeHistoryEntry(entry: HistoryEntry) {
    const agent = ALL_AGENTS.find((a) => a.id === entry.agentId);
    if (!agent) return;
    const cmd = buildSavedSessionCmd(entry, agentSettingsRef.current, installedBinariesRef.current);
    if (!cmd) return;
    setHistoryOpen(false);
    createSessionDirect(agent, cmd, entry.label, workspacePath, entry.id);
  }

  function handleTermData(termId: string, agentId: string, chunk: string) {
    if (!["claude", "codex", "gemini", "opencode"].includes(agentId)) return;
    if (capturedIdsRef.current[termId]) return;
    const id = extractSessionId(chunk);
    if (id) {
      setCapturedIds((prev) => (prev[termId] ? prev : { ...prev, [termId]: id }));
      // Update the history entry with the captured session ID
      const sess = sessionsRef.current.find((s) => s.termId === termId);
      if (sess?.historyId) {
        const updated = upsertHistory(
          sess.workspacePath,
          { agentId, label: sess.label, sessionId: id, savedAt: Date.now() },
          sess.historyId,
          chatId,
        );
        if (sess.workspacePath === workspacePathRef.current) {
          setHistoryEntries(updated);
        }
      }
    }
  }

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
      setSessions((prev) =>
        prev.map((s) => {
          if (s.termId !== termId) return s;
          // Also update history entry label
          if (s.historyId) {
            const updated = upsertHistory(
              s.workspacePath,
              { agentId: s.agentId, label: trimmed, sessionId: capturedIdsRef.current[termId], savedAt: Date.now() },
              s.historyId,
              chatId,
            );
            if (s.workspacePath === workspacePathRef.current) {
              setHistoryEntries(updated);
            }
          }
          return { ...s, label: trimmed };
        }),
      );
    }
    setRenamingTermId(null);
  }

  async function closeSession(termId: string) {
    const closing = sessionsRef.current.find((s) => s.termId === termId);
    // Push to history before closing
    if (closing) {
      const capturedId = capturedIdsRef.current[termId];
      const updated = upsertHistory(
        closing.workspacePath,
        {
          agentId: closing.agentId,
          label: closing.label,
          sessionId: capturedId,
          savedAt: Date.now(),
        },
        closing.historyId,
        chatId,
      );
      if (closing.workspacePath === workspacePathRef.current) {
        setHistoryEntries(updated);
      }
    }
    try { await invoke("terminal_close", { id: termId }); } catch {}
    setSessions((prev) => prev.filter((s) => s.termId !== termId));
    if (closing) {
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

  // ── History entry actions ────────────────────────────────────────────────────

  function deleteHistoryEntry(id: string) {
    const next = historyEntries.filter((e) => e.id !== id);
    setHistoryEntries(next);
    persistHistory(workspacePath, next);
  }

  function startHistoryRename(entry: HistoryEntry) {
    setRenamingHistoryId(entry.id);
    setHistoryRenameValue(entry.label);
  }

  function commitHistoryRename(id: string) {
    const trimmed = historyRenameValue.trim();
    if (trimmed) {
      const next = historyEntries.map((e) => (e.id === id ? { ...e, label: trimmed } : e));
      setHistoryEntries(next);
      persistHistory(workspacePath, next, chatId);
    }
    setRenamingHistoryId(null);
  }

  // ── Filtered history ─────────────────────────────────────────────────────────

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return historyEntries;
    return historyEntries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        ALL_AGENTS.find((a) => a.id === e.agentId)?.label.toLowerCase().includes(q),
    );
  }, [historyEntries, historySearch]);

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
          {/* Session history button */}
          <button
            type="button"
            className={`cli-agent-panel__icon-btn${historyOpen ? " cli-agent-panel__icon-btn--active" : ""}`}
            title="Session history"
            onClick={() => setHistoryOpen((o) => !o)}
          >
            <History size={13} />
          </button>
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

      {/* ── Session tabs (all workspaces) ── */}
      {visibleSessions.length > 0 && (
        <div className="cli-agent-panel__tabs">
          {visibleSessions.map((s) => {
            const isActive = s.termId === activeTermId;
            const isRenaming = s.termId === renamingTermId;
            const isForeignWs = s.workspacePath !== workspacePath;
            const wsBasename = s.workspacePath
              ? s.workspacePath.split("/").filter(Boolean).pop() ?? s.workspacePath
              : null;
            return (
              <div
                key={s.termId}
                className={`cli-agent-panel__tab${isActive ? " cli-agent-panel__tab--active" : ""}${isForeignWs ? " cli-agent-panel__tab--foreign" : ""}`}
                onClick={() => selectSession(s)}
                title={isForeignWs ? `Running in ${s.workspacePath}` : undefined}
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
                    {isForeignWs && wsBasename && (
                      <span className="cli-agent-panel__tab-ws-badge">{wsBasename}</span>
                    )}
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

      {/* ── Panel body (terminal + optional history overlay) ── */}
      <div className="cli-agent-panel__body" style={{ position: "relative" }}>

        {/* ── Session History Drawer ── */}
        {historyOpen && (
          <div ref={historyRef} className="cli-agent-panel__history">
            <div className="cli-agent-panel__history-search-wrap">
              <Search size={12} className="cli-agent-panel__history-search-icon" />
              <input
                ref={historySearchRef}
                className="cli-agent-panel__history-search"
                placeholder="Search sessions…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (historySearch) setHistorySearch("");
                    else setHistoryOpen(false);
                  }
                }}
              />
            </div>

            <div className="cli-agent-panel__history-list">
              {filteredHistory.length === 0 ? (
                <div className="cli-agent-panel__history-empty">
                  {historySearch ? "No matching sessions" : "No sessions yet"}
                </div>
              ) : (
                filteredHistory.map((entry) => {
                  const isRenaming = renamingHistoryId === entry.id;
                  const agentDef = ALL_AGENTS.find((a) => a.id === entry.agentId);
                  return (
                    <div key={entry.id} className="cli-agent-panel__history-row">
                      <button
                        type="button"
                        className="cli-agent-panel__history-row-main"
                        onClick={() => resumeHistoryEntry(entry)}
                        title={entry.sessionId ? `Session ID: ${entry.sessionId}` : "Resume (most recent)"}
                      >
                        <AgentLogo agentId={entry.agentId} size={13} className="cli-agent-panel__history-logo" />
                        <div className="cli-agent-panel__history-info">
                          {isRenaming ? (
                            <input
                              ref={historyRenameRef}
                              className="cli-agent-panel__history-rename"
                              value={historyRenameValue}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setHistoryRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitHistoryRename(entry.id); }
                                if (e.key === "Escape") setRenamingHistoryId(null);
                              }}
                              onBlur={() => commitHistoryRename(entry.id)}
                            />
                          ) : (
                            <span className="cli-agent-panel__history-label">{entry.label}</span>
                          )}
                          <span className="cli-agent-panel__history-meta">
                            {agentDef?.label ?? entry.agentId}
                            {" · "}
                            {relativeTime(entry.savedAt)}
                          </span>
                        </div>
                      </button>
                      <div className="cli-agent-panel__history-actions">
                        <button
                          type="button"
                          className="cli-agent-panel__history-action-btn"
                          title="Rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            startHistoryRename(entry);
                          }}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          className="cli-agent-panel__history-action-btn cli-agent-panel__history-action-btn--danger"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoryEntry(entry.id);
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {visibleSessions.length === 0 && !historyOpen && (
          <EmptyState
            agents={visibleAgents}
            onSettings={onSettings}
            onLaunch={createSession}
            onResume={resumeSession}
          />
        )}
        {sessions.map((s) => {
          const isVisibleTab = s.termId === activeTermId;
          return (
            <div
              key={s.termId}
              className="cli-agent-panel__term-wrap"
              style={{ display: isVisibleTab ? "flex" : "none" }}
            >
              <VTermCanvas
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
