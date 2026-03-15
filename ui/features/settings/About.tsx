import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

const APP_VERSION = "0.1.0";

export default function SettingsAbout() {
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-foreground">About</h1>

      <div className="space-y-1 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm text-foreground">App version</p>
            <p className="text-xs text-muted-foreground">Current application version</p>
          </div>
          <span className="rounded-md bg-input px-2.5 py-1 text-xs text-foreground">
            {APP_VERSION}
          </span>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-foreground">Open source licenses</p>
            <p className="text-xs text-muted-foreground">
              Third-party notices for bundled dependencies.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate("/settings/licenses")}
            className="text-xs"
          >
            View
          </Button>
        </div>
      </div>
    </div>
  );
}
