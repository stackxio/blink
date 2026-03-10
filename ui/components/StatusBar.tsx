interface StatusBarProps {
  isLoading: boolean;
}

export default function StatusBar({ isLoading }: StatusBarProps) {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-neutral-800 bg-background px-3 text-[10px]">
      <div className="flex items-center gap-1.5 text-neutral-500">
        {isLoading ? (
          <>
            <svg className="h-3 w-3 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-amber-500">Working...</span>
          </>
        ) : (
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            <span>Ready</span>
          </>
        )}
      </div>
      <span className="text-neutral-600">Codex</span>
    </div>
  );
}
