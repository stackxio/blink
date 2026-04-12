import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BINDINGS,
  loadBindings,
  saveBindings,
  loadKeymap,
  saveKeymap,
  effectiveKey,
  formatKey,
  keyFromEvent,
  type BindingMap,
  type Keymap,
} from "@/lib/key-bindings";
import { useAppStore, type Theme } from "@/store";

interface EditorSettings {
  auto_save: boolean;
  tab_size: number;
  font_size: number;
  word_wrap: boolean;
  minimap: boolean;
  indent_guides: boolean;
  sticky_scroll: boolean;
  inlay_hints: boolean;
  code_actions: boolean;
  diff_editor: boolean;
  inline_completions: boolean;
  semantic_highlighting: boolean;
  format_on_save: boolean;
  bracket_pairs: boolean;
  rulers: boolean;
  mouse_wheel_zoom: boolean;
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
  const [confirmQuit, setConfirmQuitState] = useState(
    () => localStorage.getItem("codrift:confirmQuit") !== "false",
  );

  function setConfirmQuit(val: boolean) {
    setConfirmQuitState(val);
    localStorage.setItem("codrift:confirmQuit", String(val));
  }
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [bindingMap, setBindingMap] = useState<BindingMap>(() => loadBindings());
  const [keymap, setKeymap] = useState<Keymap>(() => loadKeymap());
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
      localStorage.setItem("codrift:autoSave", String(patch.auto_save));
    }
    if ("tab_size" in patch) {
      localStorage.setItem("codrift:tabSize", String(patch.tab_size));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:tabSize", newValue: String(patch.tab_size) }),
      );
    }
    if ("word_wrap" in patch) {
      localStorage.setItem("codrift:wordWrap", String(patch.word_wrap));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:wordWrap", newValue: String(patch.word_wrap) }),
      );
    }
    if ("minimap" in patch) {
      localStorage.setItem("codrift:minimap", String(patch.minimap));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:minimap", newValue: String(patch.minimap) }),
      );
    }
    if ("indent_guides" in patch) {
      localStorage.setItem("codrift:indentGuides", String(patch.indent_guides));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "codrift:indentGuides",
          newValue: String(patch.indent_guides),
        }),
      );
    }
    if ("font_size" in patch) {
      localStorage.setItem("codrift:fontSize", String(patch.font_size));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:fontSize", newValue: String(patch.font_size) }),
      );
    }
    if ("sticky_scroll" in patch) {
      localStorage.setItem("codrift:stickyScroll", String(patch.sticky_scroll));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "codrift:stickyScroll",
          newValue: String(patch.sticky_scroll),
        }),
      );
    }
    if ("inlay_hints" in patch) {
      localStorage.setItem("codrift:inlayHints", String(patch.inlay_hints));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "codrift:inlayHints",
          newValue: String(patch.inlay_hints),
        }),
      );
    }
    if ("code_actions" in patch) {
      localStorage.setItem("codrift:codeActions", String(patch.code_actions));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "codrift:codeActions",
          newValue: String(patch.code_actions),
        }),
      );
    }
    if ("diff_editor" in patch) {
      localStorage.setItem("codrift:diffEditor", String(patch.diff_editor));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "codrift:diffEditor",
          newValue: String(patch.diff_editor),
        }),
      );
    }
    if ("inline_completions" in patch) {
      localStorage.setItem("codrift:inlineCompletions", String(patch.inline_completions));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "codrift:inlineCompletions",
          newValue: String(patch.inline_completions),
        }),
      );
    }
    if ("semantic_highlighting" in patch) {
      localStorage.setItem("codrift:semanticHighlighting", String(patch.semantic_highlighting));
    }
    if ("format_on_save" in patch) {
      localStorage.setItem("codrift:formatOnSave", String(patch.format_on_save));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:formatOnSave", newValue: String(patch.format_on_save) }),
      );
    }
    if ("bracket_pairs" in patch) {
      localStorage.setItem("codrift:bracketPairs", String(patch.bracket_pairs));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:bracketPairs", newValue: String(patch.bracket_pairs) }),
      );
    }
    if ("rulers" in patch) {
      localStorage.setItem("codrift:rulers", String(patch.rulers));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:rulers", newValue: String(patch.rulers) }),
      );
    }
    if ("mouse_wheel_zoom" in patch) {
      localStorage.setItem("codrift:mouseWheelZoom", String(patch.mouse_wheel_zoom));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "codrift:mouseWheelZoom", newValue: String(patch.mouse_wheel_zoom) }),
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

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Sticky scroll</div>
            <div className="settings-row__hint">
              Pin the current scope header at the top of the editor while scrolling.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.sticky_scroll ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ sticky_scroll: !editor.sticky_scroll })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Inlay hints</div>
            <div className="settings-row__hint">
              Show inline type and parameter hints from the language server.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.inlay_hints ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ inlay_hints: !editor.inlay_hints })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Code actions</div>
            <div className="settings-row__hint">
              Show the lightbulb and quick-fix menu when the cursor is on a diagnostic.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.code_actions ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ code_actions: !editor.code_actions })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Monaco diff editor</div>
            <div className="settings-row__hint">
              Use the Monaco side-by-side diff editor in the Git panel instead of the plain text
              diff.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.diff_editor ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ diff_editor: !editor.diff_editor })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Inline AI completions</div>
            <div className="settings-row__hint">
              Show AI-powered ghost text suggestions as you type (requires an openai-compatible
              provider to be configured).
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.inline_completions ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ inline_completions: !editor.inline_completions })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Semantic highlighting</div>
            <div className="settings-row__hint">
              Use LSP semantic tokens to colour identifiers by their type (variable, function,
              class, etc.) when a language server is active.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.semantic_highlighting ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ semantic_highlighting: !editor.semantic_highlighting })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Format on save</div>
            <div className="settings-row__hint">
              Run the document formatter (Prettier / LSP) automatically when saving a file.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.format_on_save ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ format_on_save: !editor.format_on_save })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Bracket pair colorization</div>
            <div className="settings-row__hint">
              Colorize matching bracket pairs with distinct colors to make nesting easier to follow.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.bracket_pairs ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ bracket_pairs: !editor.bracket_pairs })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Column rulers</div>
            <div className="settings-row__hint">
              Show vertical guide lines at 80 and 120 characters.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.rulers ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ rulers: !editor.rulers })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Mouse wheel zoom</div>
            <div className="settings-row__hint">
              Ctrl+scroll to zoom the editor font size in and out.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${editor.mouse_wheel_zoom ? "toggle--on" : ""}`}
            onClick={() => updateEditor({ mouse_wheel_zoom: !editor.mouse_wheel_zoom })}
          >
            <span className="toggle__thumb" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Workspace overrides</div>
            <div className="settings-row__hint">
              Create a <code>.codrift.json</code> file in your project root to override editor
              settings per-project (tabSize, fontSize, wordWrap, minimap, indentGuides).
            </div>
          </div>
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

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Confirm before quitting</div>
            <div className="settings-row__hint">
              Show a confirmation dialog when closing the app with unsaved changes.
            </div>
          </div>
          <button
            type="button"
            className={`toggle ${confirmQuit ? "toggle--on" : ""}`}
            onClick={() => setConfirmQuit(!confirmQuit)}
          >
            <span className="toggle__thumb" />
          </button>
        </div>
      </div>

      <h2 className="settings-section__subtitle">Appearance</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Theme</div>
            <div className="settings-row__hint">
              Choose dark, light, or follow the system setting.
            </div>
          </div>
          <div className="segment-control">
            {(["dark", "light", "system"] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`segment-control__item ${theme === t ? "segment-control__item--active" : ""}`}
                onClick={() => setTheme(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h2 className="settings-section__subtitle">Keyboard shortcuts</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Keymap</div>
            <div className="settings-row__hint">
              Switch between VS Code and JetBrains keyboard shortcuts.
            </div>
          </div>
          <div className="segment-control">
            {(["vscode", "jetbrains"] as Keymap[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`segment-control__item ${keymap === k ? "segment-control__item--active" : ""}`}
                onClick={() => {
                  setKeymap(k);
                  saveKeymap(k);
                }}
              >
                {k === "vscode" ? "VS Code" : "JetBrains"}
              </button>
            ))}
          </div>
        </div>
        {BINDINGS.map((b) => {
          const isRecording = recording === b.id;
          const key = effectiveKey(b.id, bindingMap, keymap);
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
