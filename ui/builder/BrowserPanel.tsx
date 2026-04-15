import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Play,
  Square,
  Globe,
  ChevronRight,
  Settings2,
  X,
} from "lucide-react";

// ── Persistence ───────────────────────────────────────────────────────────────

interface BrowserConfig {
  url: string;
  runCmd: string;
  autoStart: boolean;
}

function configKey(workspacePath: string) {
  return `codrift:browser-config:${workspacePath}`;
}

function loadConfig(workspacePath: string | null): BrowserConfig {
  if (!workspacePath) return { url: "http://localhost:3000", runCmd: "", autoStart: false };
  try {
    const raw = localStorage.getItem(configKey(workspacePath));
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {}
  return defaultConfig();
}

function defaultConfig(): BrowserConfig {
  return { url: "http://localhost:3000", runCmd: "npm run dev", autoStart: false };
}

function saveConfig(workspacePath: string, config: BrowserConfig) {
  localStorage.setItem(configKey(workspacePath), JSON.stringify(config));
}

// Try to detect the dev URL from package.json scripts
async function detectDevUrl(workspacePath: string): Promise<{ url: string; cmd: string } | null> {
  try {
    const pkgRaw = await invoke<string>("read_file_content", {
      path: `${workspacePath}/package.json`,
    });
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};

    if (scripts.dev) {
      // Vite defaults to 5173, Next to 3000
      const isNext = Object.keys(scripts).some((k) => scripts[k]?.includes("next"));
      return {
        url: isNext ? "http://localhost:3000" : "http://localhost:5173",
        cmd: "npm run dev",
      };
    }
    if (scripts.start) return { url: "http://localhost:3000", cmd: "npm start" };
  } catch {}
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  workspacePath: string | null;
}

export default function BrowserPanel({ workspacePath }: Props) {
  const [config, setConfig] = useState<BrowserConfig>(() =>
    loadConfig(workspacePath),
  );
  const [urlInput, setUrlInput] = useState(config.url);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [frameKey, setFrameKey] = useState(0); // forces iframe reload
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reload config when workspace changes
  useEffect(() => {
    const c = loadConfig(workspacePath);
    setConfig(c);
    setUrlInput(c.url);

    // Auto-detect dev URL for new workspaces
    if (workspacePath && !localStorage.getItem(configKey(workspacePath))) {
      detectDevUrl(workspacePath).then((detected) => {
        if (detected) {
          const next = { ...c, url: detected.url, runCmd: detected.cmd };
          setConfig(next);
          setUrlInput(detected.url);
          saveConfig(workspacePath, next);
        }
      });
    }
  }, [workspacePath]);

  function persist(patch: Partial<BrowserConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    if (workspacePath) saveConfig(workspacePath, next);
  }

  function navigate(e: React.FormEvent) {
    e.preventDefault();
    let url = urlInput.trim();
    if (!url.startsWith("http")) url = `http://${url}`;
    persist({ url });
    setFrameKey((k) => k + 1);
  }

  function refresh() {
    setFrameKey((k) => k + 1);
  }

  async function startServer() {
    if (!workspacePath || !config.runCmd.trim()) return;
    try {
      // Spawn the run command in a new terminal tab (using existing terminal infra)
      await invoke("spawn_terminal", {
        workspacePath,
        cmd: config.runCmd,
        label: "Dev Server",
      });
      setRunning(true);
      // Give the server a moment to start, then refresh the preview
      setTimeout(() => setFrameKey((k) => k + 1), 2500);
    } catch {
      // Fallback: user runs it manually
      setRunning(true);
    }
  }

  function stopServer() {
    setRunning(false);
  }

  return (
    <div className="browser-panel">
      {/* Browser chrome */}
      <div className="browser-panel__bar">
        <button
          type="button"
          className={`browser-panel__run-btn${running ? " browser-panel__run-btn--running" : ""}`}
          title={running ? "Stop server" : "Start dev server"}
          onClick={running ? stopServer : startServer}
        >
          {running ? <Square size={12} /> : <Play size={12} />}
        </button>

        <form className="browser-panel__url-form" onSubmit={navigate}>
          <Globe size={12} className="browser-panel__url-icon" />
          <input
            className="browser-panel__url-input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            spellCheck={false}
          />
          <button type="submit" className="browser-panel__url-go" title="Navigate">
            <ChevronRight size={13} />
          </button>
        </form>

        <button
          type="button"
          className="browser-panel__icon-btn"
          title="Refresh"
          onClick={refresh}
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          className={`browser-panel__icon-btn${settingsOpen ? " browser-panel__icon-btn--active" : ""}`}
          title="Preview settings"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings2 size={13} />
        </button>
      </div>

      {/* Settings dropdown */}
      {settingsOpen && (
        <div className="browser-panel__settings">
          <div className="browser-panel__settings-header">
            <span>Preview settings</span>
            <button type="button" onClick={() => setSettingsOpen(false)}>
              <X size={13} />
            </button>
          </div>
          <label className="browser-panel__settings-label">
            Run command
            <input
              className="browser-panel__settings-input"
              value={config.runCmd}
              onChange={(e) => persist({ runCmd: e.target.value })}
              placeholder="npm run dev"
              spellCheck={false}
            />
          </label>
          <label className="browser-panel__settings-label">
            Preview URL
            <input
              className="browser-panel__settings-input"
              value={config.url}
              onChange={(e) => { persist({ url: e.target.value }); setUrlInput(e.target.value); }}
              placeholder="http://localhost:3000"
              spellCheck={false}
            />
          </label>
        </div>
      )}

      {/* Preview iframe */}
      <div className="browser-panel__viewport">
        <iframe
          ref={iframeRef}
          key={frameKey}
          src={config.url}
          title="Preview"
          className="browser-panel__iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
