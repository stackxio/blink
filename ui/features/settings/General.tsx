import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

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

  async function handleFollowUpBehaviorChange(behavior: string) {
    if (!settings) return;
    const updated = { ...settings, follow_up_behavior: behavior };
    setSettings(updated);
    try {
      await invoke("save_settings", { settings: updated });
    } catch {
      // Non-critical
    }
  }

  async function handleShowActionsInChatChange(show: boolean) {
    if (!settings) return;
    const updated = { ...settings, show_actions_in_chat: show };
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
      <h1 className="mb-4 text-lg font-semibold text-foreground">General</h1>

      <div className="space-y-1 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Default provider</p>
            <p className="text-xs text-muted-foreground">Choose the AI provider for new chats</p>
          </div>
          <span className="rounded-md bg-input px-2.5 py-1 text-xs text-foreground">
            {settings?.active_provider || "Codex"}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Prompt mode</p>
            <p className="text-xs text-muted-foreground">Controls how much system prompt is sent</p>
          </div>
          <div className="flex gap-1 rounded-md bg-input p-0.5">
            {modes.map((m) => (
              <Button
                key={m.value}
                type="button"
                variant={settings?.prompt_mode === m.value ? "secondary" : "ghost"}
                size="sm"
                title={m.desc}
                className={`rounded px-2.5 py-1 text-xs ${
                  settings?.prompt_mode === m.value
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handlePromptModeChange(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Follow-up behavior</p>
            <p className="text-xs text-muted-foreground">
              Queue follow-ups while Codex runs or steer the current run. Press ⇧⌘Enter to do the
              opposite for one message.
            </p>
          </div>
          <div className="flex gap-1 rounded-md bg-input p-0.5">
            {[
              { value: "queue", label: "Queue" },
              { value: "steer", label: "Steer" },
            ].map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={(settings?.follow_up_behavior ?? "queue") === opt.value ? "secondary" : "ghost"}
                size="sm"
                className={`rounded px-2.5 py-1 text-xs ${
                  (settings?.follow_up_behavior ?? "queue") === opt.value
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handleFollowUpBehaviorChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Show actions in chat</p>
            <p className="text-xs text-muted-foreground">
              Show explored files, ran commands, and other actions in the message. You can expand to see details.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings?.show_actions_in_chat !== false}
            onClick={() => handleShowActionsInChatChange(settings?.show_actions_in_chat === false)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              settings?.show_actions_in_chat !== false ? "bg-[#55aaff]" : "bg-input"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                settings?.show_actions_in_chat !== false ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Require ⌘ + enter to send long prompts</p>
            <p className="text-xs text-muted-foreground">
              When enabled, multiline prompts require ⌘ + enter to send.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireCmdEnterForLong}
            onClick={() => setRequireCmdEnterForLong((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              requireCmdEnterForLong ? "bg-[#55aaff]" : "bg-input"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                requireCmdEnterForLong ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Send with Enter</p>
            <p className="text-xs text-muted-foreground">
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
