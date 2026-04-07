import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store";

interface WorkspaceConfig {
  tabSize?: number;
  fontSize?: number;
  wordWrap?: boolean;
  indentGuides?: boolean;
  minimap?: boolean;
}

const WORKSPACE_OVERRIDES_KEY = "codrift:workspace-overrides";

export function useWorkspaceConfig() {
  const ws = useAppStore((s) => s.activeWorkspace());
  const wsPath = ws?.path;

  useEffect(() => {
    if (!wsPath) {
      // Clear workspace overrides when no workspace
      localStorage.removeItem(WORKSPACE_OVERRIDES_KEY);
      window.dispatchEvent(
        new StorageEvent("storage", { key: WORKSPACE_OVERRIDES_KEY, newValue: null }),
      );
      return;
    }

    invoke<string | null>("read_workspace_config", { workspacePath: wsPath })
      .then((raw) => {
        if (!raw) {
          localStorage.removeItem(WORKSPACE_OVERRIDES_KEY);
          window.dispatchEvent(
            new StorageEvent("storage", { key: WORKSPACE_OVERRIDES_KEY, newValue: null }),
          );
          return;
        }
        try {
          const config: WorkspaceConfig = JSON.parse(raw);
          const json = JSON.stringify(config);
          localStorage.setItem(WORKSPACE_OVERRIDES_KEY, json);
          // Apply each setting via the existing storage event pattern
          if (config.tabSize !== undefined) {
            localStorage.setItem("codrift:tabSize", String(config.tabSize));
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "codrift:tabSize",
                newValue: String(config.tabSize),
              }),
            );
          }
          if (config.fontSize !== undefined) {
            localStorage.setItem("codrift:fontSize", String(config.fontSize));
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "codrift:fontSize",
                newValue: String(config.fontSize),
              }),
            );
          }
          if (config.wordWrap !== undefined) {
            localStorage.setItem("codrift:wordWrap", String(config.wordWrap));
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "codrift:wordWrap",
                newValue: String(config.wordWrap),
              }),
            );
          }
          if (config.indentGuides !== undefined) {
            localStorage.setItem("codrift:indentGuides", String(config.indentGuides));
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "codrift:indentGuides",
                newValue: String(config.indentGuides),
              }),
            );
          }
          if (config.minimap !== undefined) {
            localStorage.setItem("codrift:minimap", String(config.minimap));
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "codrift:minimap",
                newValue: String(config.minimap),
              }),
            );
          }
        } catch {
          // Ignore JSON parse errors
        }
      })
      .catch(() => {});
  }, [wsPath]);
}
