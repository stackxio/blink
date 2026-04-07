import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Settings2 } from "lucide-react";
import { TerminalInstance, type SpawnConfig } from "@/ide/terminal/TerminalInstance";
import { AgentLogo } from "./agent-logos";
import { ALL_AGENTS, type AgentDef, type AgentSettings } from "./agent-settings";

// ── Session state ─────────────────────────────────────────────────────────────

interface AgentSession {
  termId: string;
  agentId: string;
  label: string;
  /** Passed to TerminalInstance so it creates the PTY at the correct pixel size. */
  spawn: SpawnConfig;
}

let sessionCounter = 0;

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

  function createSession(agent: AgentDef, cmd?: string[]) {
    sessionCounter++;
    const termId = `cli-agent-${Date.now()}-${sessionCounter}`;
    const agentCount = (sessionCountsRef.current[agent.id] ?? 0) + 1;
    sessionCountsRef.current[agent.id] = agentCount;
    const label = agentCount === 1 ? agent.label : `${agent.label} ${agentCount}`;

    const customPath = agentSettings[agent.id]?.customPath?.trim() || undefined;
    const resolvedCmd = cmd ?? agent.buildCmd({ customPath, skills: skillsRef.current });

    // TerminalInstance will open xterm, measure its actual pixel dimensions via
    // FitAddon, then call terminal_create with the correct cols/rows — ensuring
    // the process always starts at the width it will be displayed at.
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

  function startRename(termId: string, currentLabel: string) {
    setActiveTermId(termId);
    setRenamingTermId(termId);
    setRenameValue(currentLabel);
    // Focus after render
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
  }

  return (
    <div className="cli-agent-panel">
      {/* ── Header bar: agent launcher buttons ── */}
      <div className="cli-agent-panel__header">
        <div className="cli-agent-panel__agents">
          {visibleAgents.map((agent) => (
            <div key={agent.id} className="cli-agent-panel__agent-group">
              <button
                type="button"
                className="cli-agent-panel__agent-btn"
                onClick={() => createSession(agent)}
                title={`New ${agent.label} session`}
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
            </div>
          ))}
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
            onSettings={onSettings}
            onLaunch={(agent) => createSession(agent)}
            onResume={(agent) => resumeSession(agent)}
          />
        ) : (
          sessions.map((s) => (
            <div
              key={s.termId}
              className="cli-agent-panel__term-wrap"
              style={{ display: s.termId === activeTermId ? "flex" : "none" }}
            >
              <TerminalInstance id={s.termId} visible={s.termId === activeTermId} spawn={s.spawn} />
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
      <div className="cli-agent-panel__agent-cards">
        {agents.map((agent) => (
          <div key={agent.id} className="cli-agent-panel__agent-card">
            <div className="cli-agent-panel__agent-card-logo">
              <AgentLogo agentId={agent.id} size={22} />
            </div>
            <div className="cli-agent-panel__agent-card-body">
              <span className="cli-agent-panel__agent-card-name">{agent.label}</span>
              <span className="cli-agent-panel__agent-card-desc">{agent.description}</span>
            </div>
            <div className="cli-agent-panel__agent-card-actions">
              <button
                type="button"
                className="cli-agent-panel__agent-card-btn cli-agent-panel__agent-card-btn--primary"
                onClick={() => onLaunch(agent)}
                title={`New ${agent.label} session`}
              >
                ▶ Start
              </button>
              {agent.resumeCmd && (
                <button
                  type="button"
                  className="cli-agent-panel__agent-card-btn"
                  onClick={() => onResume(agent)}
                  title={`Resume previous ${agent.label} session`}
                >
                  ↩ Resume
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
