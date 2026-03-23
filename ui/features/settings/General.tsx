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
  codex: { model: string };
  ollama: { endpoint: string; model: string };
  custom: { endpoint: string; model: string; api_key: string };
}

export default function SettingsGeneral() {
  const [_settings, setSettings] = useState<Settings | null>(null);
  const persistWorkspaces = useAppStore((s) => s.persistWorkspaces);
  const setPersistWorkspaces = useAppStore((s) => s.setPersistWorkspaces);
  const [bindingMap, setBindingMap] = useState<BindingMap>(() => loadBindings());
  const [recording, setRecording] = useState<string | null>(null);
  const recordingRef = useRef<string | null>(null);

  // IDE settings (stored in localStorage for now)
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem("caret:autoSave") !== "false");
  const [tabSize, setTabSize] = useState(() => parseInt(localStorage.getItem("caret:tabSize") || "2", 10));
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem("caret:fontSize") || "13", 10));
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem("caret:wordWrap") === "true");
  const [minimap, setMinimap] = useState(() => localStorage.getItem("caret:minimap") !== "false");

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

  function toggleAutoSave() {
    const next = !autoSave;
    setAutoSave(next);
    localStorage.setItem("caret:autoSave", String(next));
  }

  function changeTabSize(v: number) {
    setTabSize(v);
    localStorage.setItem("caret:tabSize", String(v));
  }

  function changeFontSize(v: number) {
    setFontSize(v);
    localStorage.setItem("caret:fontSize", String(v));
  }

  function toggleWordWrap() {
    const next = !wordWrap;
    setWordWrap(next);
    localStorage.setItem("caret:wordWrap", String(next));
  }

  function toggleMinimap() {
    const next = !minimap;
    setMinimap(next);
    localStorage.setItem("caret:minimap", String(next));
  }

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">General</h1>

      <h2 className="settings-section__subtitle">Editor</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Auto-save</div>
            <div className="settings-row__hint">Automatically save files after editing.</div>
          </div>
          <button
            type="button"
            className={`toggle ${autoSave ? "toggle--on" : ""}`}
            onClick={toggleAutoSave}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Tab size</div>
            <div className="settings-row__hint">Number of spaces per indentation level.</div>
          </div>
          <div className="segment-control">
            {[2, 4, 8].map((v) => (
              <button
                key={v}
                type="button"
                className={`segment-control__item ${tabSize === v ? "segment-control__item--active" : ""}`}
                onClick={() => changeTabSize(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Font size</div>
            <div className="settings-row__hint">Editor font size in pixels.</div>
          </div>
          <select
            className="input input--sm"
            value={fontSize}
            onChange={(e) => changeFontSize(parseInt(e.target.value, 10))}
          >
            {[11, 12, 13, 14, 15, 16, 18, 20].map((v) => (
              <option key={v} value={v}>{v}px</option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Word wrap</div>
            <div className="settings-row__hint">Wrap long lines instead of horizontal scrolling.</div>
          </div>
          <button
            type="button"
            className={`toggle ${wordWrap ? "toggle--on" : ""}`}
            onClick={toggleWordWrap}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Minimap</div>
            <div className="settings-row__hint">Show a minimap overview on the right side of the editor.</div>
          </div>
          <button
            type="button"
            className={`toggle ${minimap ? "toggle--on" : ""}`}
            onClick={toggleMinimap}
          >
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
                {isRecording ? "Press keys..." : formatKey(key)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
