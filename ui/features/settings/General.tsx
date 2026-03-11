import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Settings {
  active_provider: string;
  prompt_mode: string;
  codex: { model: string };
  ollama: { endpoint: string; model: string };
  custom: { endpoint: string; model: string; api_key: string };
}

export default function SettingsGeneral() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    invoke<Settings>("get_settings").then(setSettings).catch(() => {});
  }, []);

  async function handlePromptModeChange(mode: string) {
    if (!settings) return;
    const updated = { ...settings, prompt_mode: mode };
    setSettings(updated);
    try {
      await invoke("save_settings", { settings: updated });
    } catch {
      // Non-critical
    }
  }

  const modes = [
    { value: "full", label: "Full", desc: "All prompts + memory" },
    { value: "minimal", label: "Minimal", desc: "Identity + soul only" },
    { value: "none", label: "None", desc: "Single identity line" },
  ];

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-neutral-100">General</h1>

      <div className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <p className="text-sm text-neutral-200">Default provider</p>
            <p className="text-xs text-neutral-500">Choose the AI provider for new chats</p>
          </div>
          <span className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300">
            {settings?.active_provider || "Codex"}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <p className="text-sm text-neutral-200">Prompt mode</p>
            <p className="text-xs text-neutral-500">Controls how much system prompt is sent</p>
          </div>
          <div className="flex gap-1 rounded-md bg-neutral-800 p-0.5">
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => handlePromptModeChange(m.value)}
                title={m.desc}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  settings?.prompt_mode === m.value
                    ? "bg-neutral-700 text-neutral-200"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-neutral-200">Send with Enter</p>
            <p className="text-xs text-neutral-500">
              Press Enter to send. Shift+Enter for new line.
            </p>
          </div>
          <div className="h-5 w-9 rounded-full bg-blue-600 p-0.5">
            <div className="h-4 w-4 translate-x-4 rounded-full bg-white transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}
