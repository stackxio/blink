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

interface EditorSettings {
  auto_save: boolean;
  tab_size: number;
  font_size: number;
  word_wrap: boolean;
  minimap: boolean;
  indent_guides: boolean;
}

interface Settings {
  active_provider: string;
  codex: { model: string };
  ollama: { endpoint: string; model: string };
  custom: { endpoint: string; model: string; api_key: string };
  editor: EditorSettings;
}

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20];
const TAB_SIZES = [2, 4, 8];

export default function SettingsGeneral() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const persistWorkspaces = useAppStore((s) => s.persistWorkspaces);
  const setPersistWorkspaces = useAppStore((s) => s.setPersistWorkspaces);
  const [bindingMap, setBindingMap] = useState<BindingMap>(() => loadBindings());
  const [recording, setRecording] = useState<string | null>(null);
  const recordingRef = useRef<string | null>(null);

  useEffect(() => {
    invoke<Settings>("get_settings")
      .then(setSettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!recording) return;
    recordingRef.current = recording;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
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

  async function updateEditor(patch: Partial<EditorSettings>) {
    if (!settings) return;
    const updated: Settings = {
      ...settings,
      editor: { ...settings.editor, ...patch },
    };
    setSettings(updated);
    // Sync to localStorage so the editor picks up changes instantly via storage events
    if ("auto_save" in patch) {
      localStorage.setItem("blink:autoSave", String(patch.auto_save));
    }
    if ("tab_size" in patch) {
      localStorage.setItem("blink:tabSize", String(patch.tab_size));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "blink:tabSize", newValue: String(patch.tab_size) }),
      );
    }
    if ("word_wrap" in patch) {
      localStorage.setItem("blink:wordWrap", String(patch.word_wrap));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "blink:wordWrap", newValue: String(patch.word_wrap) }),
      );
    }
    if ("minimap" in patch) {
      localStorage.setItem("blink:minimap", String(patch.minimap));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "blink:minimap", newValue: String(patch.minimap) }),
      );
    }
    if ("indent_guides" in patch) {
      localStorage.setItem("blink:indentGuides", String(patch.indent_guides));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "blink:indentGuides",
          newValue: String(patch.indent_guides),
        }),
      );
    }
    if ("font_size" in patch) {
      localStorage.setItem("blink:fontSize", String(patch.font_size));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "blink:fontSize", newValue: String(patch.font_size) }),
      );
    }
    try {
      await invoke("save_settings", { settings: updated });
    } catch {
      setSettings(settings);
    }
  }

  if (!settings) return null;

  const { editor } = settings;

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
            className={`toggle ${editor.auto_save ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ auto_save: !editor.auto_save })}
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
            {TAB_SIZES.map((v) => (
              <button
                key={v}
                type="button"
                className={`segment-control__item ${editor.tab_size === v ? "segment-control__item--active" : ""}`}
                onClick={() => updateEditor({ tab_size: v })}
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
            value={editor.font_size}
            onChange={(e) => updateEditor({ font_size: parseInt(e.target.value, 10) })}
          >
            {FONT_SIZES.map((v) => (
              <option key={v} value={v}>
                {v}px
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Word wrap</div>
            <div className="settings-row__hint">
              Wrap long lines instead of horizontal scrolling.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.word_wrap ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ word_wrap: !editor.word_wrap })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Code minimap</div>
            <div className="settings-row__hint">
              Show or hide the code minimap on the right side of the editor.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.minimap ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ minimap: !editor.minimap })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Indent guides</div>
            <div className="settings-row__hint">
              Show or hide the vertical indentation guide lines in the editor.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.indent_guides ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ indent_guides: !editor.indent_guides })}
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
            <div className="settings-row__hint">
              Reopen your last workspaces and tabs when Blink launches.
            </div>
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
        {BINDINGS.map((b) => {
          const isRecording = recording === b.id;
          const key = effectiveKey(b.id, bindingMap);
          return (
            <div key={b.id} className="settings-row">
              <div className="settings-row__label">{b.label}</div>
              <button
                type="button"
                className={`settings-row__value ${isRecording ? "settings-row__value--recording" : ""}`}
                onClick={() => setRecording(isRecording ? null : b.id)}
                style={
                  isRecording
                    ? {
                        borderColor: "var(--c-accent)",
                        color: "var(--c-accent)",
                        background: "color-mix(in srgb, var(--c-accent) 10%, transparent)",
                      }
                    : { cursor: "pointer" }
                }
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
