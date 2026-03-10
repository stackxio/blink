export default function SettingsAppearance() {
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-neutral-100">Appearance</h1>

      <div className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <p className="text-sm text-neutral-200">Theme</p>
            <p className="text-xs text-neutral-500">Choose your preferred theme</p>
          </div>
          <div className="flex gap-1 rounded-md bg-neutral-800 p-0.5">
            <button className="rounded px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300">
              Light
            </button>
            <button className="rounded bg-neutral-700 px-2.5 py-1 text-xs text-neutral-200">
              Dark
            </button>
            <button className="rounded px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300">
              System
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-neutral-200">Font size</p>
            <p className="text-xs text-neutral-500">Adjust the UI font size</p>
          </div>
          <span className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300">
            13px
          </span>
        </div>
      </div>
    </div>
  );
}
