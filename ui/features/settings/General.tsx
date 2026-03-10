export default function SettingsGeneral() {
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
            Codex
          </span>
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
