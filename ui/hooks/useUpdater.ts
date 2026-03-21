import { useState, useEffect } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Delay check so it doesn't block startup
    const t = setTimeout(async () => {
      try {
        const u = await check();
        if (u?.available) setUpdate(u);
      } catch {
        // Ignore — update server may not be configured yet
      }
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  async function installUpdate() {
    if (!update || installing) return;
    try {
      setInstalling(true);
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      setInstalling(false);
    }
  }

  return { update, installing, installUpdate, dismiss: () => setUpdate(null) };
}
