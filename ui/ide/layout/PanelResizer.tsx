import { useRef, useCallback } from "react";

interface Props {
  direction?: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

export default function PanelResizer({ direction = "horizontal", onResize }: Props) {
  const dragging = useRef(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const el = e.currentTarget as HTMLElement;
      el.classList.add("panel-resizer--dragging");

      function onMove(ev: MouseEvent) {
        if (!dragging.current) return;
        const current = direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = current - startPos.current;
        startPos.current = current;
        onResize(delta);
      }

      function onUp() {
        dragging.current = false;
        el.classList.remove("panel-resizer--dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [direction, onResize],
  );

  return (
    <div
      className={`panel-resizer ${direction === "vertical" ? "panel-resizer--horizontal" : ""}`}
      onMouseDown={handleMouseDown}
    />
  );
}
