import { Clock } from "lucide-react";

export default function AutomationsView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised text-neutral-500">
          <Clock size={24} />
        </div>
        <h1 className="text-lg font-semibold text-neutral-100">Automations</h1>
        <p className="max-w-sm text-sm text-neutral-500">
          Automated tasks and workflows. This section is coming soon.
        </p>
      </div>
    </div>
  );
}
