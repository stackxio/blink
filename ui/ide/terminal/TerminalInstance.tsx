import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import { SearchAddon } from "@xterm/addon-search";
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
  onData,
}: {
  id: string;
  visible: boolean;
  /** Pass to have TerminalInstance create+start the PTY after the terminal
   *  has measured its real pixel size. Omit when the PTY is already running
   *  (e.g. regular shell terminals created by TerminalPanel). */
  spawn?: SpawnConfig;
  /** Called with each raw output chunk from the PTY (after the terminal writes it). */
  onData?: (chunk: string) => void;
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
        // Non-zero letterSpacing adds fractional pixels between chars, causing
        // FitAddon to drift column counts.  Explicit 0 prevents accidental overrides.
        letterSpacing: 0,
        scrollback: 5000,
        fontFamily: FONT_FAMILY,
        // Keep bold text at normal weight — switching to a bold face changes glyph
        // metrics and misaligns the cursor after bold segments in TUI apps.
        fontWeightBold: "normal",
        // Don't force bold for bright colors — would switch font face, lose Braille.
        drawBoldTextInBrightColors: false,
        // Pixel-render box-drawing / block elements independent of font.  Critical
        // for TUI borders, lines, and progress bars to render at exact cell boundaries.
        customGlyphs: true,
        // Scale Nerd Font / Powerline icons to fit their cell.
        rescaleOverlappingGlyphs: true,
        theme: getTerminalTheme(),
      });

      const fit = new FitAddon();
      const unicode11 = new Unicode11Addon();
      const searchAddon = new SearchAddon();
      term.loadAddon(fit);
      term.loadAddon(unicode11);
      term.loadAddon(searchAddon);
      term.open(container);
      // Use Unicode 11 width tables so special chars (◇ ◆ — ─ etc.) render correctly
      term.unicode.activeVersion = "11";

      // Activate WebGL renderer for pixel-accurate character cell measurement.
      // The canvas 2D renderer in WKWebView has imprecise text metrics which
      // causes FitAddon to calculate a wrong column count.  With WebGL the GPU
      // measures cells exactly, so the PTY is told the correct width and TUI
      // apps like Claude Code stop getting garbled when typing.
      // Fall back silently to the canvas renderer if WebGL is unavailable.
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {
        // WebGL unavailable — load canvas renderer explicitly.
        // Without this, xterm falls back to the DOM renderer which is the
        // slowest and least accurate option for TUI column measurement.
        try {
          term.loadAddon(new CanvasAddon());
        } catch {
          // DOM renderer is the last resort — no action needed
        }
      }

      // 3. Wait TWO animation frames so WKWebView's flex layout is fully resolved
      //    before we measure cell dimensions.  One frame is sometimes not enough
      //    for the AI panel's resizable flex column to reach its final pixel size.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
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

      // 5. After the PTY starts, force one more fit after a short delay.
      //    TUI apps (Claude Code, Codex, Gemini…) render their initial UI
      //    as soon as they receive the first PTY bytes.  If any layout
      //    settling happened between step 3 and now the cols/rows would be
      //    stale.  A SIGWINCH at ~300 ms makes every TUI app do a clean
      //    full-width re-render with the correct dimensions.
      let sigwinchTimer: ReturnType<typeof setTimeout> | null = spawn
        ? setTimeout(() => {
            sigwinchTimer = null;
            if (disposed) return;
            try { fit.fit(); } catch {}
          }, 300)
        : null;

      // Copy selected text automatically on selection change.
      // Debounced: onSelectionChange fires on every pointer-move frame during a
      // drag selection. Calling clipboard.writeText() on every frame in WKWebView
      // can interrupt the drag gesture mid-way — the async Clipboard API creates
      // microtasks that compete with the pointer event stream. 120 ms is short
      // enough to feel instant on mouseup but long enough to suppress all the
      // intermediate frames during the drag.
      let selectionCopyTimer: ReturnType<typeof setTimeout> | null = null;
      term.onSelectionChange(() => {
        if (selectionCopyTimer) clearTimeout(selectionCopyTimer);
        selectionCopyTimer = setTimeout(() => {
          selectionCopyTimer = null;
          const text = term.getSelection();
          if (text) navigator.clipboard.writeText(text).catch(() => {});
        }, 120);
      });

      // 6. Wire up I/O.
      term.onData((data) => {
        invoke("terminal_write", { id, data }).catch(() => {});
      });

      term.onResize(({ rows, cols }) => {
        invoke("terminal_resize", { id, rows, cols }).catch(() => {});
      });

      let unlisten: (() => void) | null = null;
      listen<string>(`terminal:output:${id}`, (event) => {
        if (termRef.current) termRef.current.write(event.payload);
        onData?.(event.payload);
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

      // 7. Re-read the theme from CSS variables whenever the root element's
      //    class or style attributes change (that's how the app swaps dark/
      //    light themes).  Without this, an already-running terminal stays
      //    locked to whatever theme was active at spawn time.
      const themeObserver = new MutationObserver(() => {
        const t = termRef.current;
        if (!t) return;
        try {
          t.options.theme = getTerminalTheme();
        } catch {}
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });

      // 8. Manual refit trigger (e.g. when search bar opens/closes).
      function onRefit() {
        try { fit.fit(); } catch {}
      }
      document.addEventListener("blink:terminal-refit", onRefit);

      // 9. Listen for search commands dispatched by TerminalPanel's search bar.
      function onSearchEvent(e: Event) {
        const { query, forward, clear } = (e as CustomEvent<{ query: string; forward: boolean; clear?: boolean }>).detail;
        if (clear) {
          searchAddon.clearDecorations();
          return;
        }
        if (!query) {
          searchAddon.clearDecorations();
          return;
        }
        // Search decoration colours — yellow tint for all matches, brighter for
        // the active match.  No overview ruler entries (overviewRulerWidth is 0
        // by default) so those colour options are omitted to avoid confusion with
        // WebGL rendering artefacts that users sometimes see as coloured dots.
        const searchOpts = {
          caseSensitive: false,
          regex: false,
          wholeWord: false,
          decorations: {
            matchBackground: "#ffdd0026",
            matchBorder: "#ffdd0066",
            activeMatchBackground: "#ffdd0066",
            activeMatchBorder: "#ffdd00",
          },
        };
        if (forward) {
          searchAddon.findNext(query, searchOpts);
        } else {
          searchAddon.findPrevious(query, searchOpts);
        }
      }
      document.addEventListener(`terminal:search:${id}`, onSearchEvent);

      cleanupFn = () => {
        unlisten?.();
        ro.disconnect();
        themeObserver.disconnect();
        document.removeEventListener("blink:terminal-refit", onRefit);
        document.removeEventListener(`terminal:search:${id}`, onSearchEvent);
        if (resizeTimer) clearTimeout(resizeTimer);
        if (sigwinchTimer) clearTimeout(sigwinchTimer);
        if (selectionCopyTimer) clearTimeout(selectionCopyTimer);
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
      onContextMenu={(e) => e.preventDefault()}
      style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}
    />
  );
}
