import { useEffect } from "react";
import { X } from "lucide-react";
import { useAppStore, type SettingsPage } from "@/store";
import SettingsGeneral from "@/features/settings/General";
import SettingsProviders from "@/features/settings/Providers";
import SettingsSkills from "@/features/settings/Skills";
import SettingsMemory from "@/features/settings/Memory";
import SettingsAppearance from "@/features/settings/Appearance";
import SettingsAbout from "@/features/settings/About";
import SettingsLicenses from "@/features/settings/Licenses";

const NAV_ITEMS: { label: string; page: SettingsPage }[] = [
  { label: "General", page: "general" },
  { label: "AI Providers", page: "providers" },
  { label: "Skills", page: "skills" },
  { label: "Memory", page: "memory" },
  { label: "Appearance", page: "appearance" },
  { label: "About", page: "about" },
];

export default function SettingsOverlay() {
  const settingsPage = useAppStore((s) => s.settingsPage);
  const setSettingsPage = useAppStore((s) => s.setSettingsPage);
  const closeSettings = useAppStore((s) => s.closeSettings);

  function navigate(page: SettingsPage) {
    setSettingsPage(page);
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSettings();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings]);

  function renderPage() {
    switch (settingsPage) {
      case "general":    return <SettingsGeneral />;
      case "providers":  return <SettingsProviders />;
      case "skills":     return <SettingsSkills />;
      case "memory":     return <SettingsMemory />;
      case "appearance": return <SettingsAppearance />;
      case "about":      return <SettingsAbout onNavigate={navigate} />;
      case "licenses":   return <SettingsLicenses onNavigate={navigate} />;
      default:           return <SettingsGeneral />;
    }
  }

  return (
    <div
      className="settings-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeSettings();
      }}
    >
      <div className="settings-overlay__modal">
        {/* Top bar */}
        <div className="settings-overlay__topbar">
          <span className="settings-overlay__topbar-title">Settings</span>
          <button
            type="button"
            className="settings-overlay__close-btn"
            onClick={closeSettings}
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </div>

        <div className="settings-overlay__body">
          {/* Sidebar nav */}
          <div className="settings-overlay__sidebar">
            <nav className="settings-overlay__nav">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  className={`settings-overlay__nav-item ${
                    settingsPage === item.page ||
                    (settingsPage === "licenses" && item.page === "about")
                      ? "settings-overlay__nav-item--active"
                      : ""
                  }`}
                  onClick={() => navigate(item.page)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="settings-overlay__content">
            <div className="settings-overlay__inner">{renderPage()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
