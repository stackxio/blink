import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
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
  '"JetBrains Mono", Menlo, "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", "Arial Unicode MS", monospace';

/** Prime JetBrains Mono for canvas rendering.
 *
 *  Renders a hidden DOM span so the browser populates its DOM font cache,
 *  then calls document.fonts.load() to also prime the canvas font cache
 *  (WKWebView keeps these two caches separate). Without this, ctx.fillText()
 *  can miss even a fully-loaded FontFace on the first render frame.
 *
 *  Including Claude Code's actual TUI chars (Braille, geometric shapes,
 *  Dingbats arrows) pre-caches those specific glyphs.
 */
async function ensureFont(): Promise<void> {
  const span = document.createElement("span");
  span.style.cssText =
    'position:absolute;opacity:0;pointer-events:none;font-family:"JetBrains Mono",monospace;font-size:13px;white-space:pre';
  span.textContent = "abcdefghijklmnopqrstuvwxyz0123456789⠿⠶⠦⠧◐◑◒◓❯⏵─│╭╮╰╯█▀▄";
  document.body.appendChild(span);
  // Use document.fonts.load() not document.fonts.ready — ready is a one-time
  // settled promise that's already resolved by the time a terminal tab opens.
  // load() creates a fresh request and resolves when the font is actually usable.
  await Promise.race([
    document.fonts.load('13px "JetBrains Mono"'),
    new Promise<void>((r) => setTimeout(r, 1500)),
  ]);
  document.body.removeChild(span);
}

export function TerminalInstance({ id, visible }: { id: string; visible: boolean }) {
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
      // 1. Ensure font is loaded and primed in the canvas font cache before
      //    xterm opens so the first rendered frame uses JetBrains Mono.
      await ensureFont();
      if (disposed) return;

      // 2. Create terminal (no unicodeVersion override — ink/Claude Code use
      //    standard wcwidth v6 tables; setting v11 corrupts column counts).
      const term = new Terminal({
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
      term.loadAddon(fit);
      term.open(container);

      // 3. Let xterm use its built-in canvas renderer (no WebGL addon).
      //    The canvas renderer calls ctx.fillText() per glyph, which uses the
      //    OS font-substitution stack — so even if JetBrains Mono misses a glyph
      //    the system automatically falls back to Apple Symbols / Arial Unicode MS
      //    for Braille, box-drawing, etc. The WebGL addon builds a texture atlas
      //    once at loadAddon() time; if the custom font isn't in WKWebView's
      //    canvas cache at that exact instant it gets baked in with Menlo and
      //    all Braille/TUI glyphs render as empty boxes permanently.

      requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {}
      });

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

      // Debounce resize — TUI apps (ink/Claude Code) do a full repaint per SIGWINCH.
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          try {
            fit.fit();
          } catch {}
        }, 150);
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
  }, [id]);

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
