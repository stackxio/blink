import { useEffect, useRef, useCallback } from "react";
import { X, ArrowUp, ArrowDown } from "lucide-react";
import type { UsageLocation } from "./monaco-lsp";

export interface PeekUsage extends UsageLocation {
  lineText: string;
}

export interface PeekFileGroup {
  filePath: string;
  fileName: string;
  dirLabel: string;
  usages: PeekUsage[];
}

export interface PeekData {
  symbolName: string;
  definition: PeekUsage | null;
  fileGroups: PeekFileGroup[];
  totalUsages: number;
  /** Flat ordered list of all navigable items (def first, then refs by group) */
  flatItems: Array<{ path: string; line: number; col: number }>;
}

interface Props {
  top: number;
  left: number;
  data: PeekData | null;
  loading: boolean;
  onNavigate: (path: string, line: number, col: number) => void;
  onClose: () => void;
}

export default function PeekPanel({ top, left, data, loading, onNavigate, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedIdxRef = useRef<number>(-1);

  const navigateTo = useCallback(
    (idx: number) => {
      if (!data) return;
      const item = data.flatItems[idx];
      if (!item) return;
      onNavigate(item.path, item.line, item.col);
      onClose();
    },
    [data, onNavigate, onClose],
  );

  const setSelectedIdx = useCallback((idx: number) => {
    selectedIdxRef.current = idx;
    const rows = panelRef.current?.querySelectorAll<HTMLElement>("[data-peek-idx]");
    rows?.forEach((el) => {
      el.classList.toggle("peek-panel__row--selected", el.dataset.peekIdx === String(idx));
      if (el.dataset.peekIdx === String(idx)) {
        el.scrollIntoView({ block: "nearest" });
      }
    });
  }, []);

  // Keyboard: Escape = close, arrows = select, Enter = navigate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const total = data?.flatItems.length ?? 0;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(Math.min(selectedIdxRef.current + 1, total - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(Math.max(selectedIdxRef.current - 1, 0));
        return;
      }
      if (e.key === "Enter" && selectedIdxRef.current >= 0) {
        e.preventDefault();
        navigateTo(selectedIdxRef.current);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [data, navigateTo, onClose, setSelectedIdx]);

  // Click outside to close
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("mousedown", onMouseDown, true);
    return () => window.removeEventListener("mousedown", onMouseDown, true);
  }, [onClose]);

  // Smart positioning: open above cursor if not enough space below
  const PANEL_W = 600;
  const PANEL_MAX_H = 340;
  const adjustedLeft = Math.min(left, Math.max(4, window.innerWidth - PANEL_W - 16));
  const spaceBelow = window.innerHeight - top;
  const openUpward = spaceBelow < PANEL_MAX_H + 60 && top > PANEL_MAX_H + 40;
  const adjustedTop = openUpward ? top - PANEL_MAX_H - 4 : top + 24;

  // Build flat index for each row, respecting the def + file groups order
  let idx = 0;
  const defIdx = data?.definition ? idx++ : -1;
  const groupStartIdxes: number[][] = [];
  if (data) {
    for (const g of data.fileGroups) {
      const starts: number[] = [];
      for (let i = 0; i < g.usages.length; i++) starts.push(idx++);
      groupStartIdxes.push(starts);
    }
  }

  return (
    <div
      ref={panelRef}
      className="peek-panel"
      style={{
        position: "absolute",
        top: adjustedTop,
        left: adjustedLeft,
        width: PANEL_W,
        maxHeight: PANEL_MAX_H,
        zIndex: 50,
      }}
    >
      {/* ── Header ── */}
      <div className="peek-panel__header">
        <span className="peek-panel__title">
          {data ? (
            <>
              <span className="peek-panel__symbol">{data.symbolName}</span>
              {data.totalUsages > 0 && (
                <span className="peek-panel__count"> · {data.totalUsages} usages</span>
              )}
            </>
          ) : (
            <span className="peek-panel__symbol">Searching…</span>
          )}
        </span>
        <div className="peek-panel__header-actions">
          <button
            type="button"
            className="peek-panel__nav-btn"
            title="Previous (↑)"
            onClick={() => setSelectedIdx(Math.max(selectedIdxRef.current - 1, 0))}
          >
            <ArrowUp size={11} />
          </button>
          <button
            type="button"
            className="peek-panel__nav-btn"
            title="Next (↓)"
            onClick={() =>
              setSelectedIdx(
                Math.min(selectedIdxRef.current + 1, (data?.flatItems.length ?? 1) - 1),
              )
            }
          >
            <ArrowDown size={11} />
          </button>
          <button type="button" className="peek-panel__close" onClick={onClose} title="Close (Esc)">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="peek-panel__body">
        {loading && <div className="peek-panel__placeholder">Loading usages…</div>}

        {!loading && data && data.totalUsages === 0 && !data.definition && (
          <div className="peek-panel__placeholder">No usages found</div>
        )}

        {!loading && data && (
          <>
            {/* Definition */}
            {data.definition && defIdx >= 0 && (
              <div className="peek-panel__section">
                <div className="peek-panel__section-header">
                  <span className="peek-panel__section-tag">Definition</span>
                  <span className="peek-panel__section-path">
                    {shortPath(data.definition.path)}
                  </span>
                </div>
                <div
                  className="peek-panel__row peek-panel__row--def"
                  data-peek-idx={defIdx}
                  onClick={() => navigateTo(defIdx)}
                >
                  <span className="peek-panel__line-num">{data.definition.line}</span>
                  <span className="peek-panel__line-text">{data.definition.lineText.trim()}</span>
                </div>
              </div>
            )}

            {/* Usages grouped by file */}
            {data.fileGroups.map((group, gi) => (
              <div key={group.filePath} className="peek-panel__section">
                <div className="peek-panel__section-header">
                  <span className="peek-panel__file-name">{group.fileName}</span>
                  {group.dirLabel && (
                    <span className="peek-panel__file-dir"> {group.dirLabel}</span>
                  )}
                </div>
                {group.usages.map((usage, ui) => {
                  const rowIdx = groupStartIdxes[gi]?.[ui] ?? -1;
                  return (
                    <div
                      key={`${usage.path}:${usage.line}:${usage.character}`}
                      className="peek-panel__row"
                      data-peek-idx={rowIdx}
                      onClick={() => navigateTo(rowIdx)}
                    >
                      <span className="peek-panel__line-num">{usage.line}</span>
                      <span className="peek-panel__line-text">{usage.lineText.trim()}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Show last 2 path segments for a compact display */
function shortPath(absolutePath: string): string {
  const parts = absolutePath.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/");
}
