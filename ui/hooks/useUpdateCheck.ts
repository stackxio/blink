import { useState, useEffect, useCallback } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; update: Update }
  | { status: "up_to_date" }
  | { status: "downloading"; progress: number; downloaded: number; total: number }
  | { status: "ready" }
  | { status: "error"; message: string };

const DISMISS_KEY = "codrift:update-dismissed";

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  const runCheck = useCallback(async (silent: boolean) => {
    if (!silent) setState({ status: "checking" });
    try {
      const update = await check();
      if (!update) {
        if (!silent) setState({ status: "up_to_date" });
        return;
      }
      if (silent) {
        // Auto-check: skip if user already dismissed this exact version
        const prev = localStorage.getItem(DISMISS_KEY);
        if (prev === update.version) return;
      }
      setDismissed(false);
      setState({ status: "available", update });
    } catch {
      if (!silent) setState({ status: "error", message: "Could not reach update server." });
    }
  }, []);

  useEffect(() => {
    // Check 4s after launch — don't block startup
    const timer = setTimeout(() => void runCheck(true), 4000);
    return () => clearTimeout(timer);
  }, [runCheck]);

  const checkNow = useCallback(() => void runCheck(false), [runCheck]);

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
  const isChecking = state.status === "checking";
  const isDownloading = state.status === "downloading";
  const isReady = state.status === "ready";
  const isUpToDate = state.status === "up_to_date";
  const latestVersion = state.status === "available" ? state.update.version : null;
  const progress = state.status === "downloading" ? state.progress : null;
  const downloadedBytes = state.status === "downloading" ? state.downloaded : null;
  const totalBytes = state.status === "downloading" ? state.total : null;
  const errorMessage = state.status === "error" ? state.message : null;

  return {
    hasUpdate,
    isChecking,
    isDownloading,
    isReady,
    isUpToDate,
    latestVersion,
    progress,
    downloadedBytes,
    totalBytes,
    errorMessage,
    checkNow,
    install,
    restartNow,
    dismiss,
  };
}
