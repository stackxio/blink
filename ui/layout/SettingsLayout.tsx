import { Outlet, useNavigate, useLocation } from "react-router";

const NAV_ITEMS = [
  { label: "General", path: "/settings" },
  { label: "AI Providers", path: "/settings/providers" },
  { label: "Skills", path: "/settings/skills" },
  { label: "Memory", path: "/settings/memory" },
  { label: "Appearance", path: "/settings/appearance" },
];

export default function SettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex h-full bg-background text-neutral-100">
      {/* Settings sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-sidebar">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 px-4 py-3 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
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
                    ? "bg-surface-raised text-neutral-100"
                    : "text-neutral-400 hover:bg-surface-raised/60 hover:text-neutral-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Settings content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
