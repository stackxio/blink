import { Outlet, useNavigate, useLocation } from "react-router";

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
        <div className="h-3 shrink-0" />
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 px-4 pb-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to app
        </button>

        <nav className="flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Settings content */}
      <main className="flex-1 overflow-y-auto bg-background px-6 pb-6 pt-6">
        <div className="mx-auto max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
