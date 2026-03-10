export default function SettingsProviders() {
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-neutral-100">AI Providers</h1>

      <div className="space-y-3">
        {/* Codex */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm font-medium text-neutral-200">Codex</p>
            </div>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
              DEFAULT
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Uses the locally installed Codex CLI</p>
        </div>

        {/* Ollama */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-neutral-600" />
            <p className="text-sm font-medium text-neutral-200">Ollama</p>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Connect to a local Ollama server</p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              placeholder="http://localhost:11434"
              className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-600"
            />
            <input
              type="text"
              placeholder="Model (e.g. llama3)"
              className="w-36 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-600"
            />
          </div>
        </div>

        {/* Custom */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-neutral-600" />
            <p className="text-sm font-medium text-neutral-200">Custom API</p>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Any OpenAI-compatible endpoint</p>
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              placeholder="Endpoint URL"
              className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-600"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Model"
                className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-600"
              />
              <input
                type="password"
                placeholder="API key (optional)"
                className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-neutral-600"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
