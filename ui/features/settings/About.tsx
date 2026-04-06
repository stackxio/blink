import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import type { SettingsPage } from "@/store";

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

interface Props {
  onNavigate: (page: SettingsPage) => void;
}

export default function SettingsAbout({ onNavigate }: Props) {
  const [version, setVersion] = useState<string | null>(null);
  const {
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
  } = useUpdateCheck();

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  function updateHint() {
    if (isReady) return "Update downloaded — restart to apply.";
    if (isDownloading) {
      const pct = progress !== null ? `${progress}%` : "…";
      if (totalBytes && downloadedBytes !== null) {
        return `Downloading ${pct} — ${fmtBytes(downloadedBytes)} / ${fmtBytes(totalBytes)}`;
      }
      return `Downloading ${pct}`;
    }
    if (hasUpdate) return `Version ${latestVersion} is available.`;
    if (isChecking) return "Checking for updates…";
    if (isUpToDate) return "You're on the latest version.";
    if (errorMessage) return `Error: ${errorMessage}`;
    return "Check for the latest version of Codrift.";
  }

  const showCheckButton = !hasUpdate && !isChecking && !isDownloading && !isReady;

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

        <div className="settings-row settings-row--col">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div className="settings-row__info">
              <div className="settings-row__label">Updates</div>
              <div className="settings-row__hint">{updateHint()}</div>
            </div>
            <div style={{ flexShrink: 0 }}>
              {isReady && (
                <button type="button" className="btn btn--default btn--sm" onClick={restartNow}>
                  Restart Now
                </button>
              )}
              {hasUpdate && !isDownloading && !isReady && (
                <button type="button" className="btn btn--default btn--sm" onClick={install}>
                  Install {latestVersion}
                </button>
              )}
              {showCheckButton && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={checkNow}
                  disabled={isChecking}
                >
                  Check for Updates
                </button>
              )}
            </div>
          </div>
          {isDownloading && (
            <div className="about-progress">
              <div className="about-progress__bar" style={{ width: `${progress ?? 0}%` }} />
            </div>
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
            onClick={() => onNavigate("licenses")}
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}
