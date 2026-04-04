import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateInfo {
  version: string;
  body: string | null;
}

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; info: UpdateInfo }
  | { status: "up_to_date" }
  | { status: "installing" }
  | { status: "error"; message: string };

export default function SettingsAbout() {
  const navigate = useNavigate();
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  // Listen for "Check for Updates" from the native menu
  useEffect(() => {
    function onCheckUpdates() {
      checkForUpdate();
    }
    document.addEventListener("blink:check-updates", onCheckUpdates);
    return () => document.removeEventListener("blink:check-updates", onCheckUpdates);
  }, []);

  async function checkForUpdate() {
    setUpdate({ status: "checking" });
    try {
      const info = await invoke<UpdateInfo | null>("check_for_update");
      if (info) {
        setUpdate({ status: "available", info });
      } else {
        setUpdate({ status: "up_to_date" });
        setTimeout(() => setUpdate({ status: "idle" }), 3000);
      }
    } catch (e) {
      setUpdate({ status: "error", message: String(e) });
    }
  }

  async function installUpdate() {
    setUpdate({ status: "installing" });
    try {
      await invoke("install_update");
      await relaunch();
    } catch (e) {
      setUpdate({ status: "error", message: String(e) });
    }
  }

  return (
    <div className="settings-section">
      <h1 className="settings-section__title">About</h1>
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">App version</div>
            <div className="settings-row__hint">Current application version</div>
          </div>
          <span className="settings-row__value">{version ?? "…"}</span>
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Updates</div>
            <div className="settings-row__hint">
              {update.status === "checking" && "Checking for updates…"}
              {update.status === "up_to_date" && "You're on the latest version."}
              {update.status === "available" && `Version ${update.info.version} is available.`}
              {update.status === "installing" && "Downloading and installing…"}
              {update.status === "error" && `Error: ${update.message}`}
              {update.status === "idle" && "Check for the latest version of Blink."}
            </div>
          </div>
          {update.status === "available" ? (
            <button type="button" className="btn btn--default btn--sm" onClick={installUpdate}>
              Install & Restart
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={update.status === "checking" || update.status === "installing"}
              onClick={checkForUpdate}
            >
              {update.status === "checking" ? "Checking…" : "Check for Updates"}
            </button>
          )}
        </div>

        <div className="settings-row">
          <div className="settings-row__info">
            <div className="settings-row__label">Open source licenses</div>
            <div className="settings-row__hint">Third-party notices for bundled dependencies.</div>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => navigate("/settings/licenses")}
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}
