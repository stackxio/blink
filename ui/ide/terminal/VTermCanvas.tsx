/**
 * VTermCanvas — canvas-based terminal renderer driven by the `vterm` Rust backend.
 *
 * The Rust side processes PTY output through the `vt100` VT/ANSI parser and
 * emits structured grid frames. This component renders those frames onto a
 * plain <canvas> element — no xterm.js, no WebGL compositing, no artifacts.
 *
 * Binary frame format (base64-encoded):
 *   Header (8 bytes):
 *     u16 LE : cols
 *     u16 LE : rows
 *     u16 LE : cursor_x
 *     u16 LE : cursor_y
 *   Per-cell (12 bytes, row-major):
 *     u32 LE : Unicode code point
 *     u8     : fg_r, fg_g, fg_b
 *     u8     : bg_r, bg_g, bg_b
 *     u8     : flags  (bit0=bold bit1=italic bit2=underline bit3=inverse bit4=dim bit5=wide)
 *     u8     : cursor (1 if this is the cursor cell)
 */

import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT_SIZE = 13;
const LINE_HEIGHT = 1.2;
const FONT_FAMILY =
  '"JetBrains Mono", "Apple Symbols", Menlo, "SF Mono", Consolas, monospace';
const CELL_BYTES = 12;
const HEADER_BYTES = 8;

// ── Theme detection ───────────────────────────────────────────────────────────

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains("dark");
}

// ── Font loading (shared with TerminalInstance) ───────────────────────────────

let fontLoadPromise: Promise<void> | null = null;

async function loadFont(): Promise<void> {
  try {
    const [regular, bold] = await Promise.all([
      fetch("/fonts/JetBrainsMono-Regular.ttf").then((r) => r.arrayBuffer()),
      fetch("/fonts/JetBrainsMono-Bold.ttf").then((r) => r.arrayBuffer()),
    ]);
    const faceRegular = new FontFace("JetBrains Mono", regular, { weight: "400" });
    const faceBold = new FontFace("JetBrains Mono", bold, { weight: "700" });
    await Promise.all([faceRegular.load(), faceBold.load()]);
    document.fonts.add(faceRegular);
    document.fonts.add(faceBold);
  } catch {
    // Non-fatal — fall back to Menlo
  }
}

function ensureFont(): Promise<void> {
  if (!fontLoadPromise) fontLoadPromise = loadFont();
  return fontLoadPromise;
}

// ── Cell size measurement ─────────────────────────────────────────────────────

interface CellSize {
  w: number;
  h: number;
  baseline: number;
}

function measureCellSize(): CellSize {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  const metrics = ctx.measureText("M");
  const w = Math.ceil(metrics.width);
  const h = Math.ceil(FONT_SIZE * LINE_HEIGHT);
  // ascent from the top of the cell
  const baseline = Math.ceil(
    metrics.actualBoundingBoxAscent ?? FONT_SIZE * 0.8
  );
  return { w, h, baseline };
}

// ── Key input → escape sequences ─────────────────────────────────────────────

function keyToData(e: KeyboardEvent): string | null {
  // Don't intercept browser shortcuts
  if (e.metaKey) return null;

  if (e.ctrlKey && !e.altKey && e.key.length === 1) {
    const upper = e.key.toUpperCase().charCodeAt(0);
    if (upper >= 64 && upper <= 95) {
      return String.fromCharCode(upper - 64);
    }
  }

  if (!e.ctrlKey && !e.altKey && e.key.length === 1) {
    return e.key;
  }

  switch (e.key) {
    case "Enter":     return "\r";
    case "Backspace": return "\x7f";
    case "Tab":       return e.shiftKey ? "\x1b[Z" : "\t";
    case "Escape":    return "\x1b";
    case "ArrowUp":   return e.shiftKey ? "\x1b[1;2A" : "\x1b[A";
    case "ArrowDown": return e.shiftKey ? "\x1b[1;2B" : "\x1b[B";
    case "ArrowRight":return e.shiftKey ? "\x1b[1;2C" : "\x1b[C";
    case "ArrowLeft": return e.shiftKey ? "\x1b[1;2D" : "\x1b[D";
    case "Home":      return "\x1b[H";
    case "End":       return "\x1b[F";
    case "PageUp":    return "\x1b[5~";
    case "PageDown":  return "\x1b[6~";
    case "Delete":    return "\x1b[3~";
    case "Insert":    return "\x1b[2~";
    case "F1":        return "\x1bOP";
    case "F2":        return "\x1bOQ";
    case "F3":        return "\x1bOR";
    case "F4":        return "\x1bOS";
    case "F5":        return "\x1b[15~";
    case "F6":        return "\x1b[17~";
    case "F7":        return "\x1b[18~";
    case "F8":        return "\x1b[19~";
    case "F9":        return "\x1b[20~";
    case "F10":       return "\x1b[21~";
    case "F11":       return "\x1b[23~";
    case "F12":       return "\x1b[24~";
  }
  return null;
}

// ── Frame decoder ─────────────────────────────────────────────────────────────

interface DecodedFrame {
  cols: number;
  rows: number;
  cursorX: number;
  cursorY: number;
  bytes: Uint8Array;
}

function decodeFrame(base64: string): DecodedFrame | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    if (bytes.length < HEADER_BYTES) return null;
    const view = new DataView(bytes.buffer);
    const cols = view.getUint16(0, true);
    const rows = view.getUint16(2, true);
    const cursorX = view.getUint16(4, true);
    const cursorY = view.getUint16(6, true);
    return { cols, rows, cursorX, cursorY, bytes };
  } catch {
    return null;
  }
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: DecodedFrame,
  cell: CellSize
) {
  const { cols, rows, cursorX, cursorY, bytes } = frame;
  const { w: cw, h: ch, baseline } = cell;
  const view = new DataView(bytes.buffer);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const offset = HEADER_BYTES + (row * cols + col) * CELL_BYTES;
      if (offset + CELL_BYTES > bytes.length) break;

      const cp     = view.getUint32(offset, true);
      const fgR    = bytes[offset + 4];
      const fgG    = bytes[offset + 5];
      const fgB    = bytes[offset + 6];
      const bgR    = bytes[offset + 7];
      const bgG    = bytes[offset + 8];
      const bgB    = bytes[offset + 9];
      const flags  = bytes[offset + 10] ?? 0;
      const isCursor = (bytes[offset + 11] ?? 0) === 1;

      const bold    = (flags & 1) !== 0;
      const italic  = (flags & 2) !== 0;
      const underline = (flags & 4) !== 0;
      const inverse = (flags & 8) !== 0;

      const x = col * cw;
      const y = row * ch;

      // Apply inverse video
      const drawFgR = inverse ? bgR : fgR;
      const drawFgG = inverse ? bgG : fgG;
      const drawFgB = inverse ? bgB : fgB;
      const drawBgR = inverse ? fgR : bgR;
      const drawBgG = inverse ? fgG : bgG;
      const drawBgB = inverse ? fgB : bgB;

      // Background
      ctx.fillStyle = `rgb(${drawBgR},${drawBgG},${drawBgB})`;
      ctx.fillRect(x, y, cw, ch);

      // Cursor block (rendered before the character so text is visible on top)
      if (isCursor) {
        ctx.fillStyle = "rgba(212,212,212,0.85)";
        ctx.fillRect(x, y, cw, ch);
      }

      // Character — guard against wide-char continuation cells and
      // any other out-of-range code points the vt100 crate may emit.
      const isValidCp =
        cp > 0x20 &&
        cp <= 0x10ffff &&
        (cp < 0xd800 || cp > 0xdfff);
      if (isValidCp) {
        const char = String.fromCodePoint(cp);
        const fontStyle = italic ? "italic " : "";
        const fontWeight = bold ? "bold " : "";
        ctx.font = `${fontStyle}${fontWeight}${FONT_SIZE}px ${FONT_FAMILY}`;
        ctx.textBaseline = "alphabetic";

        if (isCursor) {
          // Invert character colour on cursor cell
          ctx.fillStyle = `rgb(${drawBgR},${drawBgG},${drawBgB})`;
        } else {
          ctx.fillStyle = `rgb(${drawFgR},${drawFgG},${drawFgB})`;
        }
        ctx.fillText(char, x, y + baseline);
      }

      // Underline
      if (underline) {
        ctx.fillStyle = `rgb(${drawFgR},${drawFgG},${drawFgB})`;
        ctx.fillRect(x, y + ch - 2, cw, 1);
      }
    }
  }

  // Blinking cursor outline for empty cells
  if (cursorY < rows && cursorX < cols) {
    const offset = HEADER_BYTES + (cursorY * cols + cursorX) * CELL_BYTES;
    const isCursorCell = (bytes[offset + 11] ?? 0) === 1;
    if (!isCursorCell) {
      // Cursor wasn't in any cell (shouldn't happen) — draw outline anyway
      ctx.strokeStyle = "rgba(212,212,212,0.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(cursorX * cw + 0.5, cursorY * ch + 0.5, cw - 1, ch - 1);
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface VTermSpawnConfig {
  cmd: string[];
  cwd: string | null;
}

export function VTermCanvas({
  id,
  visible,
  spawn,
  onData,
}: {
  id: string;
  visible: boolean;
  spawn?: VTermSpawnConfig;
  onData?: (chunk: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const cellRef      = useRef<CellSize>({ w: 8, h: 16, baseline: 12 });
  const frameRef     = useRef<DecodedFrame | null>(null);
  const mountedRef   = useRef(false);
  const colsRef      = useRef(80);
  const rowsRef      = useRef(24);
  // Keep onData in a ref so changing it doesn't re-run the mount effect
  // (which would recreate the terminal on every CliAgentPanel re-render).
  const onDataRef    = useRef(onData);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const frame  = frameRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w: cw, h: ch } = cellRef.current;
    const dpr      = window.devicePixelRatio || 1;
    const cssW     = frame.cols * cw;
    const cssH     = frame.rows * ch;
    const bufW     = Math.round(cssW * dpr);
    const bufH     = Math.round(cssH * dpr);

    // Resize the backing buffer only when dimensions change.
    // IMPORTANT: resizing the canvas resets the context transform, so we always
    // re-apply the DPR scale before rendering.
    if (canvas.width !== bufW || canvas.height !== bufH) {
      canvas.width        = bufW;
      canvas.height       = bufH;
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    // Scale so renderFrame can use logical (CSS) pixel coordinates.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderFrame(ctx, frame, cellRef.current);
  }, []);

  const computeSize = useCallback((): { cols: number; rows: number } => {
    const container = containerRef.current;
    if (!container) return { cols: colsRef.current, rows: rowsRef.current };
    const { w: cw, h: ch } = cellRef.current;

    // When the container is inside a CSS-hidden ancestor (display:none on a tab
    // wrapper) clientWidth/Height are 0.  Walk up to find the nearest visible
    // ancestor so we get a meaningful size even before the tab is shown.
    let w = container.clientWidth;
    let h = container.clientHeight;
    if (w === 0 || h === 0) {
      let el: HTMLElement | null = container.parentElement;
      while (el) {
        if (el.clientWidth > 0 && el.clientHeight > 0) {
          w = el.clientWidth;
          h = el.clientHeight;
          break;
        }
        el = el.parentElement;
      }
    }

    // Subtract the padding added to the container (6px top/bottom, 8px left/right)
    const cols = Math.max(10, Math.floor((w - 16) / cw));
    const rows = Math.max(4,  Math.floor((h - 12) / ch));
    return { cols, rows };
  }, []);

  // When tab becomes visible: always send a resize so the TUI app gets SIGWINCH
  // and redraws at the correct dimensions.  This is critical when the PTY was
  // originally created while the container was CSS-hidden (clientWidth===0) and
  // therefore started at the wrong size.
  useEffect(() => {
    if (!visible || !mountedRef.current) return;
    requestAnimationFrame(() => {
      const { cols, rows } = computeSize();
      // Always update and resize — a redundant SIGWINCH is harmless but a missed
      // one leaves the canvas half-empty after a tab switch.
      colsRef.current = cols;
      rowsRef.current = rows;
      invoke("vterm_resize", { id, rows, cols }).catch(() => {});
    });
  }, [visible, id, computeSize]);

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const container = containerRef.current;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let ro: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;

    const run = async () => {
      await ensureFont();
      if (disposed) return;

      // Measure cell size with the loaded font
      cellRef.current = measureCellSize();

      // Wait for layout to settle
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      );
      if (disposed) return;

      const { cols, rows } = computeSize();
      colsRef.current = cols;
      rowsRef.current = rows;

      // Spawn the process if we own it
      if (spawn) {
        try {
          await invoke("vterm_create", {
            id,
            cwd: spawn.cwd,
            rows,
            cols,
            command: spawn.cmd,
            dark: isDarkTheme(),
          });
        } catch (err) {
          console.error("[vterm] vterm_create failed:", err);
          mountedRef.current = false;
          return;
        }
        if (disposed) {
          invoke("vterm_close", { id }).catch(() => {});
          mountedRef.current = false;
          return;
        }
      }

      // Watch for app theme changes and update the terminal palette live
      themeObserver = new MutationObserver(() => {
        if (disposed) return;
        invoke("vterm_set_colors", { id, dark: isDarkTheme() }).catch(() => {});
        // Also force a container background repaint
        if (containerRef.current) {
          containerRef.current.style.background = isDarkTheme() ? "#1e1e1e" : "#f5f5f5";
        }
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      // Listen for frame events from Rust
      listen<{ data: string }>(`vterm:frame:${id}`, (event) => {
        const frame = decodeFrame(event.payload.data);
        if (!frame) return;
        frameRef.current = frame;
        requestAnimationFrame(draw);
      })
        .then((fn) => { unlisten = fn; })
        .catch(() => {});

      // SIGWINCH at ~300 ms to let TUI apps do a clean full-width render
      if (spawn) {
        setTimeout(() => {
          if (disposed) return;
          const { cols: c, rows: r } = computeSize();
          if (c !== colsRef.current || r !== rowsRef.current) {
            colsRef.current = c;
            rowsRef.current = r;
            invoke("vterm_resize", { id, rows: r, cols: c }).catch(() => {});
          }
        }, 300);
      }

      // Resize observer
      ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          if (disposed) return;
          const { cols: c, rows: r } = computeSize();
          if (c !== colsRef.current || r !== rowsRef.current) {
            colsRef.current = c;
            rowsRef.current = r;
            invoke("vterm_resize", { id, rows: r, cols: c }).catch(() => {});
          }
        }, 50);
      });
      ro.observe(container);
    };

    run();

    return () => {
      disposed = true;
      unlisten?.();
      ro?.disconnect();
      themeObserver?.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      mountedRef.current = false;
    };
  }, [id, spawn, draw, computeSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const data = keyToData(e.nativeEvent);
      if (data !== null) {
        e.preventDefault();
        e.stopPropagation();
        invoke("vterm_write", { id, data }).catch(() => {});
      }
    },
    [id]
  );

  // Mouse wheel — attached as a non-passive native listener so preventDefault()
  // actually stops the event from bubbling to the parent scrollable container.
  //
  // Scroll direction (Mac natural scrolling):
  //   deltaY < 0  →  two-finger swipe UP  →  see older content  →  +delta (increase offset)
  //   deltaY > 0  →  two-finger swipe DOWN →  see newer content  →  -delta (decrease offset)
  //
  // Hard throttle: at most 1 step per 150 ms so even a hard flick scrolls
  // ≤7 frames (~700 ms of history).  rAF-batching alone isn't enough because
  // rAF fires at 60 fps — a half-second swipe would still send 18–36 steps.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastScrollTime = 0;
    const THROTTLE_MS = 150;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastScrollTime < THROTTLE_MS) return;
      lastScrollTime = now;
      const step = e.deltaY < 0 ? 1 : -1;
      invoke("vterm_scroll", { id, delta: step }).catch(() => {});
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [id]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        background: "var(--vterm-bg, #1e1e1e)",
        position: "relative",
        padding: "6px 8px",
        // Prevent trackpad scroll from propagating to parent scrollable
        // containers in Tauri's WKWebView (CSS backup for the non-passive
        // wheel listener below).
        overscrollBehavior: "none",
        touchAction: "none",
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={(e) => (e.currentTarget as HTMLElement).focus()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", imageRendering: "pixelated" }}
      />
    </div>
  );
}
