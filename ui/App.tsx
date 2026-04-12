import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

// ── Quit confirmation dialog ──────────────────────────────────────────────────
// Uses a React overlay instead of a native Tauri dialog to avoid the
// blocking_show() deadlock that occurs when the dialog is invoked from an
// onCloseRequested handler (both compete for the main thread).

function QuitConfirmDialog({ onQuit, onCancel }: { onQuit: () => void; onCancel: () => void }) {
  // Focus the "Cancel" button by default so Enter doesn't accidentally quit
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          background: "var(--c-surface, #1e1e1e)",
          border: "1px solid var(--c-border, #333)",
          borderRadius: 10,
          padding: "28px 32px 24px",
          width: 340,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: "var(--c-fg, #d4d4d4)" }}>
            Quit Blink?
          </span>
          <span style={{ fontSize: 13, color: "var(--c-fg-muted, #888)" }}>
            You have unsaved changes. They will be lost if you quit now.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "1px solid var(--c-border, #444)",
              background: "transparent", color: "var(--c-fg, #d4d4d4)",
              cursor: "pointer", fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onQuit}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: "#e05252", color: "#fff",
              cursor: "pointer", fontSize: 13, fontWeight: 500,
            }}
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

// Intercept the window close button — show a React confirm dialog if the user
// has unsaved files and confirm-quit is enabled. Returns dialog state to render.
function useQuitConfirm(): { open: boolean; onQuit: () => void; onCancel: () => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onCloseRequested((event) => {
        const confirmEnabled = localStorage.getItem("codrift:confirmQuit") !== "false";
        if (!confirmEnabled) return;

        const hasUnsaved = useAppStore
          .getState()
          .workspaces.some((ws) => ws.openFiles.some((f) => f.modified));
        if (!hasUnsaved) return;

        // Prevent the default close and show our React dialog instead.
        event.preventDefault();
        setOpen(true);
      })
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const onQuit = () => {
    setOpen(false);
    getCurrentWindow().destroy().catch(() => {});
  };
  const onCancel = () => setOpen(false);

  return { open, onQuit, onCancel };
}

function useOpenFileEvent() {
  useEffect(() => {
    const unlisten = listen<string>("open-file", (event) => {
      const path = event.payload;
      if (!path) return;
      const name = path.split("/").pop() || path;
      // Check if the path is a directory — open as workspace, otherwise open as file
      invoke<boolean>("is_dir", { path })
        .then((isDir) => {
          if (isDir) {
            useAppStore.getState().addWorkspace(path, name);
          } else {
            useAppStore.getState().openFile(path, name, false);
          }
        })
        .catch(() => {
          useAppStore.getState().openFile(path, name, false);
        });
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
  const { open: quitOpen, onQuit, onCancel } = useQuitConfirm();
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

      {/* Quit confirmation — rendered above everything else */}
      {quitOpen && <QuitConfirmDialog onQuit={onQuit} onCancel={onCancel} />}
    </BrowserRouter>
  );
}
