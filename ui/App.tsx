import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTheme, changeTheme, type Theme } from "@/lib/theme";
import { useAppStore } from "@/store";
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig";
import IdeLayout from "@/ide/layout/IdeLayout";
import Welcome from "@/ide/layout/Welcome";
import SettingsOverlay from "@/overlays/SettingsOverlay";
import ExtensionsOverlay from "@/overlays/ExtensionsOverlay";

// Sync backend settings → localStorage on startup so the editor reads correct values
function useSyncSettingsToLocalStorage() {
  useEffect(() => {
    invoke<Record<string, unknown>>("get_settings")
      .then((s) => {
        const editor = s.editor as Record<string, unknown> | undefined;
        if (editor) {
          if (editor.auto_save != null)
            localStorage.setItem("codrift:autoSave", String(editor.auto_save));
          if (editor.tab_size != null)
            localStorage.setItem("codrift:tabSize", String(editor.tab_size));
          if (editor.font_size != null)
            localStorage.setItem("codrift:fontSize", String(editor.font_size));
          if (editor.word_wrap != null)
            localStorage.setItem("codrift:wordWrap", String(editor.word_wrap));
          if (editor.minimap != null)
            localStorage.setItem("codrift:minimap", String(editor.minimap));
          if (editor.indent_guides != null)
            localStorage.setItem("codrift:indentGuides", String(editor.indent_guides));
        }
        const appearance = s.appearance as Record<string, unknown> | undefined;
        if (appearance?.theme) {
          changeTheme(appearance.theme as Theme);
        }
      })
      .catch(() => {});
  }, []);
}

function useOpenFileEvent() {
  useEffect(() => {
    const unlisten = listen<string>("open-file", (event) => {
      const path = event.payload;
      if (path) {
        const name = path.split("/").pop() || path;
        useAppStore.getState().openFile(path, name, false);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
}

export default function App() {
  useTheme();
  useSyncSettingsToLocalStorage();
  useOpenFileEvent();
  useWorkspaceConfig();
  const settingsOpen = useAppStore((s) => s.settingsOpen);

  return (
    <BrowserRouter>
      {/* IdeLayout is ALWAYS mounted — agent sessions and downloads survive navigation */}
      <Routes>
        <Route element={<IdeLayout />}>
          <Route index element={<Welcome />} />
        </Route>

        {/* Extensions — full overlay (keeps its own route) */}
        <Route path="extensions" element={<ExtensionsOverlay />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Settings rendered as a fixed full-screen overlay so IdeLayout never unmounts.
          This preserves agent terminal sessions and in-progress update downloads. */}
      {settingsOpen && <SettingsOverlay />}
    </BrowserRouter>
  );
}
