import { Outlet, useNavigate, useLocation } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { label: "General", path: "/settings" },
  { label: "AI Providers", path: "/settings/providers" },
  { label: "MCP servers", path: "/settings/mcp" },
  { label: "Skills", path: "/settings/skills" },
  { label: "Memory", path: "/settings/memory" },
  { label: "Appearance", path: "/settings/appearance" },
  { label: "Archived", path: "/settings/archived" },
  { label: "About", path: "/settings/about" },
];

export default function SettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex h-full text-foreground">
      {/* Settings sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="h-8 shrink-0 titlebar-drag" data-tauri-drag-region />
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-1 px-4 pb-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={13} />
          Back to app
        </button>

        <nav className="flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                onClick={() => navigate(item.path)}
                className={`w-full justify-start px-3 py-1.5 text-left text-[13px] font-normal ${
                  isActive
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </Button>
            );
          })}
        </nav>
      </aside>

      {/* Settings content */}
      <main className="relative flex-1 overflow-y-auto bg-background px-6 pb-6 pt-6">
        <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-8" />
        <div className="mx-auto max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
