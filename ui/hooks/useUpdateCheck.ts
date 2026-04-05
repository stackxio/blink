import { useState, useEffect, useCallback } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateState =
  | { status: "idle" }
  | { status: "available"; update: Update }
  | { status: "downloading"; progress: number; downloaded: number; total: number }
  | { status: "ready" }
  | { status: "error"; message: string };

const DISMISS_KEY = "blink:update-dismissed";

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check 4s after launch — don't block startup
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (!update) return;
        // Check if user already dismissed this version
        const prev = localStorage.getItem(DISMISS_KEY);
        if (prev === update.version) return;
        setState({ status: "available", update });
      } catch {
        // Silently ignore — no network, updater not configured, etc.
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = useCallback(() => {
    if (state.status === "available") {
      localStorage.setItem(DISMISS_KEY, state.update.version);
    }
    setDismissed(true);
  }, [state]);

  const install = useCallback(async () => {
    if (state.status !== "available") return;
    const { update } = state;
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          setState({ status: "downloading", progress: 0, downloaded: 0, total });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          setState({ status: "downloading", progress: pct, downloaded, total });
        } else if (event.event === "Finished") {
          setState({ status: "ready" });
        }
      });
    } catch (e) {
      setState({ status: "error", message: String(e) });
    }
  }, [state]);

  const restartNow = useCallback(async () => {
    await relaunch();
  }, []);

  const hasUpdate = state.status === "available" && !dismissed;
  const isDownloading = state.status === "downloading";
  const isReady = state.status === "ready";
  const latestVersion = state.status === "available" ? state.update.version : null;
  const progress = state.status === "downloading" ? state.progress : null;
  const downloadedBytes = state.status === "downloading" ? state.downloaded : null;
  const totalBytes = state.status === "downloading" ? state.total : null;

  return {
    hasUpdate,
    isDownloading,
    isReady,
    latestVersion,
    progress,
    downloadedBytes,
    totalBytes,
    install,
    restartNow,
    dismiss,
  };
}
