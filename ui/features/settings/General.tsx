import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BINDINGS,
  loadBindings,
  saveBindings,
  effectiveKey,
  formatKey,
  keyFromEvent,
  type BindingMap,
} from "@/lib/key-bindings";
import { useAppStore } from "@/store";

interface Settings {
  active_provider: string;
  prompt_mode: string;
  follow_up_behavior?: string;
  show_actions_in_chat?: boolean;
  codex: { model: string };
  ollama: { endpoint: string; model: string };
  custom: { endpoint: string; model: string; api_key: string };
}

export default function SettingsGeneral() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [requireCmdEnterForLong, setRequireCmdEnterForLong] = useState(false);
  const persistWorkspaces = useAppStore((s) => s.persistWorkspaces);
  const setPersistWorkspaces = useAppStore((s) => s.setPersistWorkspaces);
  const [bindingMap, setBindingMap] = useState<BindingMap>(() => loadBindings());
  const [recording, setRecording] = useState<string | null>(null);
  const recordingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    recordingRef.current = recording;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      if (e.key === "Escape") { setRecording(null); return; }
      const combo = keyFromEvent(e);
      if (!combo) return;
      const updated = { ...bindingMap, [recordingRef.current!]: combo };
      setBindingMap(updated);
      saveBindings(updated);
      setRecording(null);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, bindingMap]);

  useEffect(() => {
    invoke<Settings>("get_settings").then(setSettings).catch(() => {});
  }, []);

  async function save(updated: Settings) {
    setSettings(updated);
    try { await invoke("save_settings", { settings: updated }); } catch {}
  }

  const modes = [
    { value: "full", label: "Full" },
    { value: "minimal", label: "Minimal" },
    { value: "none", label: "None" },
  ];

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">General</h1>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Default provider</div>
            <div className="settings-row__hint">Choose the AI provider for new chats</div>
          </div>
          <span className="settings-row__value">{settings?.active_provider || "Codex"}</span>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Prompt mode</div>
            <div className="settings-row__hint">Controls how much system prompt is sent</div>
          </div>
          <div className="segment-control">
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`segment-control__item ${settings?.prompt_mode === m.value ? "segment-control__item--active" : ""}`}
                onClick={() => settings && save({ ...settings, prompt_mode: m.value })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Follow-up behavior</div>
            <div className="settings-row__hint">Queue follow-ups or steer the current run. ⇧⌘Enter for opposite.</div>
          </div>
          <div className="segment-control">
            {["queue", "steer"].map((v) => (
              <button
                key={v}
                type="button"
                className={`segment-control__item ${(settings?.follow_up_behavior ?? "queue") === v ? "segment-control__item--active" : ""}`}
                onClick={() => settings && save({ ...settings, follow_up_behavior: v })}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Show actions in chat</div>
            <div className="settings-row__hint">Show explored files, ran commands, and other actions inline.</div>
          </div>
          <button
            type="button"
            className={`toggle ${settings?.show_actions_in_chat !== false ? "toggle--on" : ""}`}
            onClick={() => settings && save({ ...settings, show_actions_in_chat: settings.show_actions_in_chat === false })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Require ⌘+Enter for long prompts</div>
            <div className="settings-row__hint">Multiline prompts require ⌘+Enter to send.</div>
          </div>
          <button
            type="button"
            className={`toggle ${requireCmdEnterForLong ? "toggle--on" : ""}`}
            onClick={() => setRequireCmdEnterForLong((v) => !v)}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Send with Enter</div>
            <div className="settings-row__hint">Press Enter to send. Shift+Enter for new line.</div>
          </div>
          <button type="button" className="toggle toggle--on" disabled>
            <span className="toggle__thumb" />
          </button>
        </div>
      </div>

      <h2 className="settings-section__subtitle">Workspace</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Persist workspaces across restarts</div>
            <div className="settings-row__hint">Reopen your last workspaces and tabs when Caret launches.</div>
          </div>
          <button
            type="button"
            className={`toggle ${persistWorkspaces ? "toggle--on" : ""}`}
            onClick={() => setPersistWorkspaces(!persistWorkspaces)}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
      </div>

      <h2 className="settings-section__subtitle">Keyboard shortcuts</h2>
      <div className="settings-card">
        {BINDINGS.map((b, i) => {
          const isLast = i === BINDINGS.length - 1;
          const isRecording = recording === b.id;
          const key = effectiveKey(b.id, bindingMap);
          return (
            <div key={b.id} className={`settings-row ${isLast ? "" : ""}`}>
              <div className="settings-row__label">{b.label}</div>
              <button
                type="button"
                className={`settings-row__value ${isRecording ? "settings-row__value--recording" : ""}`}
                onClick={() => setRecording(isRecording ? null : b.id)}
                style={isRecording ? { borderColor: "var(--c-accent)", color: "var(--c-accent)", background: "color-mix(in srgb, var(--c-accent) 10%, transparent)" } : { cursor: "pointer" }}
              >
                {isRecording ? "Press keys…" : formatKey(key)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
