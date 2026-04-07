import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";

export function getTerminalTheme() {
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

const FONT_FAMILY =
  '"JetBrains Mono", "Apple Symbols", Menlo, "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", "Arial Unicode MS", monospace';

// Only load the font once across all terminal instances.
let fontLoadPromise: Promise<void> | null = null;

/**
 * Load JetBrains Mono by fetching the font binary directly and injecting it
 * via the FontFace API. This is the only reliable approach in WKWebView:
 *
 *  - CSS @font-face + document.fonts.load() only checks whether the CSS font
 *    is ready, but WKWebView's canvas cache is separate from the DOM cache
 *    so ctx.fillText() can still miss the font on the first frame.
 *  - new FontFace(name, ArrayBuffer) bypasses CSS entirely — the browser parses
 *    the binary data synchronously and document.fonts.add() makes it
 *    immediately available to canvas.
 */
async function loadFont(): Promise<void> {
  try {
    const [regular, bold] = await Promise.all([
      fetch("/fonts/JetBrainsMono-Regular.ttf").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
      fetch("/fonts/JetBrainsMono-Bold.ttf").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);

    const faceRegular = new FontFace("JetBrains Mono", regular, { weight: "400" });
    const faceBold = new FontFace("JetBrains Mono", bold, { weight: "700" });

    await Promise.all([faceRegular.load(), faceBold.load()]);

    document.fonts.add(faceRegular);
    document.fonts.add(faceBold);
  } catch (err) {
    // Non-fatal — fall back to Menlo / Apple Symbols from the font stack.
    console.warn("[terminal] JetBrains Mono load failed, falling back:", err);
  }
}

function ensureFont(): Promise<void> {
  if (!fontLoadPromise) fontLoadPromise = loadFont();
  return fontLoadPromise;
}

/** When provided, TerminalInstance creates the PTY itself at the correct
 *  post-fit pixel dimensions so the process always starts at the right width. */
export interface SpawnConfig {
  cmd: string[];
  cwd: string | null;
}

export function TerminalInstance({
  id,
  visible,
  spawn,
}: {
  id: string;
  visible: boolean;
  /** Pass to have TerminalInstance create+start the PTY after the terminal
   *  has measured its real pixel size. Omit when the PTY is already running
   *  (e.g. regular shell terminals created by TerminalPanel). */
  spawn?: SpawnConfig;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const container = containerRef.current;
    let disposed = false;
    let cleanupFn = () => {
      mountedRef.current = false;
    };

    const run = async () => {
      // 1. Load the font BEFORE opening xterm.
      //    xterm's canvas renderer measures cell width/height from the active
      //    font at open() time. If JetBrains Mono isn't loaded yet, xterm uses
      //    Menlo (~7.8 px/col). FitAddon then calculates cols from Menlo metrics
      //    but the actual rendered glyphs use JetBrains Mono (~8 px/col), so
      //    the PTY is told 2-3 extra columns that never appear on screen — every
      //    line Claude Code draws at "full width" wraps to the next line.
      await ensureFont();
      if (disposed) return;

      // 2. Open xterm. Font is now loaded so cell measurements are correct.
      const term = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        lineHeight: 1.2,
        fontSize: 13,
        scrollback: 5000,
        fontFamily: FONT_FAMILY,
        // Bold face of most monospace fonts lacks Braille; keep it normal weight.
        fontWeightBold: "normal",
        // Don't force bold for bright colors — would switch font face, lose Braille.
        drawBoldTextInBrightColors: false,
        // Scale Nerd Font / Powerline icons to fit their cell.
        rescaleOverlappingGlyphs: true,
        theme: getTerminalTheme(),
      });

      const fit = new FitAddon();
      const unicode11 = new Unicode11Addon();
      term.loadAddon(fit);
      term.loadAddon(unicode11);
      term.open(container);
      // Use Unicode 11 width tables so special chars (◇ ◆ — ─ etc.) render correctly
      term.unicode.activeVersion = "11";

      // 3. Wait one animation frame so the browser has laid out the container,
      //    then fit to get accurate cols/rows from actual pixel dimensions.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (disposed) {
        term.dispose();
        return;
      }
      try {
        fit.fit();
      } catch {}

      termRef.current = term;
      fitRef.current = fit;

      // 4. If we are responsible for spawning the process, call terminal_create
      //    with the EXACT cols/rows xterm measured — the process starts at the
      //    same width xterm displays, so its initial render is always correct.
      if (spawn) {
        try {
          await invoke("terminal_create", {
            id,
            cwd: spawn.cwd,
            rows: term.rows,
            cols: term.cols,
            shell: null,
            command: spawn.cmd,
          });
        } catch (err) {
          console.error("[terminal] terminal_create failed:", err);
          term.dispose();
          termRef.current = null;
          fitRef.current = null;
          mountedRef.current = false;
          return;
        }

        if (disposed) {
          invoke("terminal_close", { id }).catch(() => {});
          term.dispose();
          termRef.current = null;
          fitRef.current = null;
          mountedRef.current = false;
          return;
        }
      }

      // 5. Wire up I/O.
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

      // 6. Debounce resize — TUI apps (ink/Claude Code) do a full repaint per
      //    SIGWINCH. 50ms is fast enough to keep the display in sync while
      //    avoiding a storm of repaints during a panel drag.
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          try {
            fit.fit();
          } catch {}
        }, 50);
      });
      ro.observe(container);

      cleanupFn = () => {
        unlisten?.();
        ro.disconnect();
        if (resizeTimer) clearTimeout(resizeTimer);
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
        mountedRef.current = false;
      };
    };

    run();

    return () => {
      disposed = true;
      cleanupFn();
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visible && fitRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {}
      });
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}
    />
  );
}
