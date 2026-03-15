import { Input } from "@/components/ui/input";

export default function SettingsProviders() {
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-foreground">AI Providers</h1>

      <div className="space-y-3">
        {/* Codex */}
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm font-medium text-foreground">Codex</p>
            </div>
            <span className="rounded bg-input px-2 py-0.5 text-[10px] text-muted-foreground">
              DEFAULT
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Uses the locally installed Codex CLI</p>
        </div>

        {/* Ollama */}
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-muted" />
            <p className="text-sm font-medium text-foreground">Ollama</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Connect to a local Ollama server</p>
          <div className="mt-2 flex gap-2">
            <Input
              type="text"
              placeholder="http://localhost:11434"
              className="h-8 flex-1 px-2 py-1 text-xs"
            />
            <Input
              type="text"
              placeholder="Model (e.g. llama3)"
              className="h-8 w-36 px-2 py-1 text-xs"
            />
          </div>
        </div>

        {/* Custom */}
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-muted" />
            <p className="text-sm font-medium text-foreground">Custom API</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Any OpenAI-compatible endpoint</p>
          <div className="mt-2 flex flex-col gap-2">
            <Input
              type="text"
              placeholder="Endpoint URL"
              className="h-8 px-2 py-1 text-xs"
            />
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Model"
                className="h-8 flex-1 px-2 py-1 text-xs"
              />
              <Input
                type="password"
                placeholder="API key (optional)"
                className="h-8 flex-1 px-2 py-1 text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
