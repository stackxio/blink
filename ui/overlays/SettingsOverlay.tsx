import { useNavigate, useLocation, Outlet } from "react-router";
import { ChevronLeft } from "lucide-react";

const NAV_ITEMS = [
  { label: "General", path: "/settings" },
  { label: "AI Providers", path: "/settings/providers" },
  { label: "MCP Servers", path: "/settings/mcp" },
  { label: "Skills", path: "/settings/skills" },
  { label: "Memory", path: "/settings/memory" },
  { label: "Appearance", path: "/settings/appearance" },
  { label: "Archived", path: "/settings/archived" },
  { label: "About", path: "/settings/about" },
];

export default function SettingsOverlay() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="settings-overlay">
      {/* Sidebar nav */}
      <div className="settings-overlay__sidebar">
        <button
          type="button"
          className="settings-overlay__back"
          onClick={() => navigate("/")}
        >
          <ChevronLeft />
          Back
        </button>
        <nav className="settings-overlay__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`settings-overlay__nav-item ${location.pathname === item.path ? "settings-overlay__nav-item--active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="settings-overlay__content">
        <div className="settings-overlay__inner">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
