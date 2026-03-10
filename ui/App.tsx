import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { ChatLayout } from "@/layout";
import { SettingsLayout } from "@/layout";
import ChatArea from "@/components/ChatArea";
import SettingsGeneral from "@/features/settings/General";
import SettingsProviders from "@/features/settings/Providers";
import SettingsSkills from "@/features/settings/Skills";
import SettingsAppearance from "@/features/settings/Appearance";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ChatLayout />}>
          <Route index element={<ChatArea />} />
          <Route path="chat/:threadId" element={<ChatArea />} />
        </Route>
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsGeneral />} />
          <Route path="providers" element={<SettingsProviders />} />
          <Route path="skills" element={<SettingsSkills />} />
          <Route path="appearance" element={<SettingsAppearance />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
