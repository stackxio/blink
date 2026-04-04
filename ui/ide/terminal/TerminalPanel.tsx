import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Plus, X, Trash2, SplitSquareHorizontal } from "lucide-react";
import { useAppStore } from "@/store";
import "@xterm/xterm/css/xterm.css";

let termCounter = 0;

export default function TerminalPanel() {
  const ws = useAppStore((s) => s.activeWorkspace());
  const addTerminalId = useAppStore((s) => s.addTerminalId);
  const removeTerminalId = useAppStore((s) => s.removeTerminalId);
  const setActiveTerminalId = useAppStore((s) => s.setActiveTerminalId);
  const createdRef = useRef(false);
  const [splitId, setSplitId] = useState<string | null>(null);

  const terminalIds = ws?.terminalIds ?? [];
  const activeTerminalId = ws?.activeTerminalId ?? null;
  const workspacePath = ws?.path || null;

  async function createSession(): Promise<string | null> {
    termCounter++;
    const id = `term-${Date.now()}-${termCounter}`;
    try {
      await invoke("terminal_create", {
        id,
        cwd: workspacePath,
        rows: 24,
        cols: 80,
      });
      addTerminalId(id);
      return id;
    } catch (err) {
      console.error("Failed to create terminal:", err);
      return null;
    }
  }

  async function closeSession(id: string) {
    try {
      await invoke("terminal_close", { id });
    } catch {}

    const isLast = terminalIds.length <= 1;
    removeTerminalId(id);

    if (isLast) {
      useAppStore.getState().toggleBottomPanel();
    }
  }

  // Auto-create first terminal when panel opens with no sessions
  useEffect(() => {
    if (createdRef.current || terminalIds.length > 0) return;
    createdRef.current = true;
    createSession();
    return () => {
      createdRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  function getTermName(_id: string, idx: number) {
    return `Terminal ${idx + 1}`;
  }

  async function createSplit() {
    const id = await createSession();
    if (id) setSplitId(id);
  }

  function closeSplitPane() {
    setSplitId(null);
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-panel__header">
        <div className="terminal-panel__tabs">
          {terminalIds.map((id, idx) => (
            <button
              key={id}
              type="button"
              className={`terminal-panel__tab ${activeTerminalId === id ? "terminal-panel__tab--active" : ""}`}
              onClick={() => setActiveTerminalId(id)}
            >
              {getTermName(id, idx)}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(id);
                  if (splitId === id) setSplitId(null);
                }}
                style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
              >
                <X size={10} />
              </span>
            </button>
          ))}
        </div>
        <div className="terminal-panel__actions">
          <button
            type="button"
            className="terminal-panel__action"
            onClick={createSession}
            title="New Terminal"
          >
            <Plus />
          </button>
          <button
            type="button"
            className="terminal-panel__action"
            onClick={createSplit}
            title="Split Terminal"
          >
            <SplitSquareHorizontal />
          </button>
          <button
            type="button"
            className="terminal-panel__action"
            onClick={() => activeTerminalId && closeSession(activeTerminalId)}
            title="Kill Terminal"
          >
            <Trash2 />
          </button>
        </div>
      </div>
      <div className={`terminal-panel__body${splitId ? " terminal-panel__body--split" : ""}`}>
        {/* Primary pane */}
        <div className="terminal-pane-wrap">
          {terminalIds.map((id) => {
            const isActive = activeTerminalId === id && id !== splitId;
            return (
              <div
                key={id}
                className="terminal-instance-wrap"
                style={{ display: isActive ? "flex" : "none" }}
              >
                <TerminalInstance id={id} visible={isActive} />
              </div>
            );
          })}
        </div>
        {/* Split pane */}
        {splitId && (
          <>
            <div className="terminal-split-divider" />
            <div className="terminal-pane-wrap" style={{ position: "relative" }}>
              <button
                type="button"
                onClick={closeSplitPane}
                title="Close Split"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  zIndex: 10,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--c-muted-fg)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={12} />
              </button>
              <div className="terminal-instance-wrap" style={{ display: "flex" }}>
                <TerminalInstance id={splitId} visible />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const get = (v: string) => style.getPropertyValue(v).trim() || undefined;
  const isDark =
    document.documentElement.classList.contains("dark") ||
    (!document.documentElement.classList.contains("light") &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return {
    background: get("--c-bg") || (isDark ? "#1e1e1e" : "#ffffff"),
    foreground: get("--c-fg") || (isDark ? "#d4d4d4" : "#1e1e1e"),
    cursor: get("--c-fg") || (isDark ? "#d4d4d4" : "#1e1e1e"),
    selectionBackground: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
    black: isDark ? "#1e1e1e" : "#000000",
    red: "#f44747",
    green: "#6a9955",
    yellow: "#d7ba7d",
    blue: "#569cd6",
    magenta: "#c586c0",
    cyan: "#4ec9b0",
    white: isDark ? "#d4d4d4" : "#1e1e1e",
    brightBlack: "#808080",
    brightRed: "#f44747",
    brightGreen: "#6a9955",
    brightYellow: "#d7ba7d",
    brightBlue: "#569cd6",
    brightMagenta: "#c586c0",
    brightCyan: "#4ec9b0",
    brightWhite: "#ffffff",
  };
}

function TerminalInstance({ id, visible }: { id: string; visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const term = new Terminal({
      cursorBlink: true,
      lineHeight: 1.2,
      fontSize: 13,
      scrollback: 5000,
      fontFamily: '"SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      theme: getTerminalTheme(),
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    // Enable WebGL renderer for GPU-accelerated rendering; fall back silently
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {}
    requestAnimationFrame(() => fit.fit());

    termRef.current = term;
    fitRef.current = fit;

    term.onData((data) => {
      invoke("terminal_write", { id, data }).catch(() => {});
    });

    term.onResize(({ rows, cols }) => {
      invoke("terminal_resize", { id, rows, cols }).catch(() => {});
    });

    let unlisten: (() => void) | null = null;
    listen<string>(`terminal:output:${id}`, (event) => {
      if (termRef.current) termRef.current.write(event.payload);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {}
      });
    });
    ro.observe(containerRef.current);

    return () => {
      unlisten?.();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      mountedRef.current = false;
    };
  }, [id]);

  useEffect(() => {
    if (visible && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [visible]);

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }} />
  );
}
