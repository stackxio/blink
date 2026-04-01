import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { useTheme, changeTheme, type Theme } from "@/lib/theme";
import IdeLayout from "@/ide/layout/IdeLayout";
import Welcome from "@/ide/layout/Welcome";
import SettingsOverlay from "@/overlays/SettingsOverlay";
import ExtensionsOverlay from "@/overlays/ExtensionsOverlay";
import SettingsGeneral from "@/features/settings/General";
import SettingsProviders from "@/features/settings/Providers";
import SettingsMcp from "@/features/settings/Mcp";
import SettingsSkills from "@/features/settings/Skills";
import SettingsMemory from "@/features/settings/Memory";
import SettingsAppearance from "@/features/settings/Appearance";
import SettingsArchived from "@/features/settings/Archived";
import SettingsAbout from "@/features/settings/About";
import SettingsLicenses from "@/features/settings/Licenses";

// Sync backend settings → localStorage on startup so the editor reads correct values
function useSyncSettingsToLocalStorage() {
  useEffect(() => {
    invoke<Record<string, unknown>>("get_settings")
      .then((s) => {
        const editor = s.editor as Record<string, unknown> | undefined;
        if (editor) {
          if (editor.auto_save != null) localStorage.setItem("blink:autoSave", String(editor.auto_save));
          if (editor.tab_size != null) localStorage.setItem("blink:tabSize", String(editor.tab_size));
          if (editor.font_size != null) localStorage.setItem("blink:fontSize", String(editor.font_size));
          if (editor.word_wrap != null) localStorage.setItem("blink:wordWrap", String(editor.word_wrap));
          if (editor.minimap != null) localStorage.setItem("blink:minimap", String(editor.minimap));
        }
        const appearance = s.appearance as Record<string, unknown> | undefined;
        if (appearance?.theme) {
          changeTheme(appearance.theme as Theme);
        }
      })
      .catch(() => {});
  }, []);
}

export default function App() {
  useTheme();
  useSyncSettingsToLocalStorage();
  return (
    <BrowserRouter>
      <Routes>
        {/* IDE layout */}
        <Route element={<IdeLayout />}>
          <Route index element={<Welcome />} />
        </Route>

        {/* Settings — full overlay with its own sidebar nav */}
        <Route path="settings" element={<SettingsOverlay />}>
          <Route index element={<SettingsGeneral />} />
          <Route path="providers" element={<SettingsProviders />} />
          <Route path="mcp" element={<SettingsMcp />} />
          <Route path="skills" element={<SettingsSkills />} />
          <Route path="memory" element={<SettingsMemory />} />
          <Route path="appearance" element={<SettingsAppearance />} />
          <Route path="archived" element={<SettingsArchived />} />
          <Route path="about" element={<SettingsAbout />} />
          <Route path="licenses" element={<SettingsLicenses />} />
        </Route>

        {/* Extensions — full overlay */}
        <Route path="extensions" element={<ExtensionsOverlay />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
