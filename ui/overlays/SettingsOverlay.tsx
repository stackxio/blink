import { ChevronLeft } from "lucide-react";
import { useAppStore, type SettingsPage } from "@/store";
import SettingsGeneral from "@/features/settings/General";
import SettingsProviders from "@/features/settings/Providers";
import SettingsSkills from "@/features/settings/Skills";
import SettingsAppearance from "@/features/settings/Appearance";
import SettingsArchived from "@/features/settings/Archived";
import SettingsAbout from "@/features/settings/About";
import SettingsLicenses from "@/features/settings/Licenses";

const NAV_ITEMS: { label: string; page: SettingsPage }[] = [
  { label: "General", page: "general" },
  { label: "AI Providers", page: "providers" },
  { label: "Skills", page: "skills" },
  { label: "Appearance", page: "appearance" },
  { label: "Archived", page: "archived" },
  { label: "About", page: "about" },
];

export default function SettingsOverlay() {
  const settingsPage = useAppStore((s) => s.settingsPage);
  const setSettingsPage = useAppStore((s) => s.setSettingsPage);
  const closeSettings = useAppStore((s) => s.closeSettings);

  function navigate(page: SettingsPage) {
    setSettingsPage(page);
  }

  function renderPage() {
    switch (settingsPage) {
      case "general":
        return <SettingsGeneral />;
      case "providers":
        return <SettingsProviders />;
      case "skills":
        return <SettingsSkills />;
      case "appearance":
        return <SettingsAppearance />;
      case "archived":
        return <SettingsArchived />;
      case "about":
        return <SettingsAbout onNavigate={navigate} />;
      case "licenses":
        return <SettingsLicenses onNavigate={navigate} />;
      default:
        return <SettingsGeneral />;
    }
  }

  return (
    <div className="settings-overlay">
      {/* Drag region for window dragging */}
      <div className="settings-overlay__drag-region" data-tauri-drag-region />
      {/* Sidebar nav */}
      <div className="settings-overlay__sidebar">
        <button type="button" className="settings-overlay__back" onClick={closeSettings}>
          <ChevronLeft />
          Back
        </button>
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
  );
}
