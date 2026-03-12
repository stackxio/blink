import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useTheme } from "@/lib/theme";
import { ChatLayout } from "@/layout";
import { SettingsLayout } from "@/layout";
import ChatArea from "@/components/ChatArea";
import ProjectView from "@/components/ProjectView";
import AutomationsView from "@/components/AutomationsView";
import SettingsGeneral from "@/features/settings/General";
import SettingsProviders from "@/features/settings/Providers";
import SettingsMcp from "@/features/settings/Mcp";
import SettingsSkills from "@/features/settings/Skills";
import SettingsMemory from "@/features/settings/Memory";
import SettingsAppearance from "@/features/settings/Appearance";
import SettingsArchived from "@/features/settings/Archived";
import SettingsAbout from "@/features/settings/About";
import SettingsLicenses from "@/features/settings/Licenses";

export default function App() {
  useTheme();
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ChatLayout />}>
          <Route index element={<ChatArea />} />
          <Route path="chat/:threadId" element={<ChatArea />} />
          <Route path="project/:folderId" element={<ProjectView />} />
          <Route path="automations" element={<AutomationsView />} />
        </Route>
        <Route path="settings" element={<SettingsLayout />}>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
