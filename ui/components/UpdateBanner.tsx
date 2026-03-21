import { Download, X } from "lucide-react";
import { useUpdater } from "@/hooks/useUpdater";

export default function UpdateBanner() {
  const { update, installing, installUpdate, dismiss } = useUpdater();

  if (!update) return null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2 text-[13px]">
      <Download size={14} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 text-foreground">
        Caret {update.version} is available.
      </span>
      <button
        type="button"
        onClick={installUpdate}
        disabled={installing}
        className="shrink-0 rounded-md bg-accent px-3 py-1 text-xs text-white transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {installing ? "Installing…" : "Update now"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
