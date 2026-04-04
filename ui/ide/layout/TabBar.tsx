import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { OpenFile } from "@/store";

interface ContextMenu {
  x: number;
  y: number;
  idx: number;
}

interface Props {
  files: OpenFile[];
  activeIdx: number;
  workspacePath?: string | null;
  onSelect: (idx: number) => void;
  onClose: (idx: number) => void;
  onCloseAll: () => void;
  onCloseOthers: (idx: number) => void;
  extraActions?: React.ReactNode;
}

export default function TabBar({
  files,
  activeIdx,
  workspacePath,
  onSelect,
  onClose,
  onCloseAll,
  onCloseOthers,
  extraActions,
}: Props) {
  const [ctx, setCtx] = useState<ContextMenu | null>(null);

  const dismiss = useCallback(() => setCtx(null), []);

  // Close on any click or Escape
  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx, dismiss]);

  if (files.length === 0) return null;

  function handleContextMenu(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, idx });
  }

  function closeToRight(idx: number) {
    // Close from end to avoid index shifting
    for (let i = files.length - 1; i > idx; i--) {
      onClose(i);
    }
  }

  function copyPath(idx: number) {
    navigator.clipboard.writeText(files[idx].path);
  }

  function copyRelativePath(idx: number) {
    const full = files[idx].path;
    if (workspacePath && full.startsWith(workspacePath)) {
      const rel = full.slice(workspacePath.length).replace(/^\//, "");
      navigator.clipboard.writeText(rel);
    } else {
      navigator.clipboard.writeText(full);
    }
  }

  return (
    <div className="tab-bar">
      {extraActions && <div className="tab-bar__extra-actions">{extraActions}</div>}
      {files.map((file, i) => {
        const isActive = i === activeIdx;
        const cls = [
          "tab",
          isActive && "tab--active",
          file.modified && "tab--modified",
          file.preview && "tab--preview",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={file.path}
            className={cls}
            onClick={() => onSelect(i)}
            onContextMenu={(e) => handleContextMenu(e, i)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(i);
            }}
          >
            <span
              className="tab__name"
              style={{
                ...(file.preview ? { fontStyle: "italic" } : {}),
                ...(file.deleted ? { textDecoration: "line-through", opacity: 0.5 } : {}),
              }}
            >
              {file.name}
            </span>
            {file.modified && <span className="tab__modified" />}
            <span
              className="tab__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(i);
              }}
              role="button"
              aria-label="Close tab"
            >
              <X size={12} />
            </span>
          </div>
        );
      })}

      {ctx &&
        createPortal(
          <div
            className="menu"
            style={{ left: ctx.x, top: ctx.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="menu__item"
              onClick={() => {
                onClose(ctx.idx);
                dismiss();
              }}
            >
              Close
            </button>
            <button
              className={`menu__item ${files.length <= 1 ? "menu__item--disabled" : ""}`}
              onClick={() => {
                onCloseOthers(ctx.idx);
                dismiss();
              }}
            >
              Close Others
            </button>
            <button
              className="menu__item"
              onClick={() => {
                onCloseAll();
                dismiss();
              }}
            >
              Close All
            </button>
            <button
              className={`menu__item ${ctx.idx >= files.length - 1 ? "menu__item--disabled" : ""}`}
              onClick={() => {
                closeToRight(ctx.idx);
                dismiss();
              }}
            >
              Close to the Right
            </button>
            <div className="menu__separator" />
            <button
              className="menu__item"
              onClick={() => {
                copyPath(ctx.idx);
                dismiss();
              }}
            >
              Copy Path
            </button>
            <button
              className="menu__item"
              onClick={() => {
                copyRelativePath(ctx.idx);
                dismiss();
              }}
            >
              Copy Relative Path
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
