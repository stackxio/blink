import { useRef, useEffect } from "react";

interface Props {
  direction?: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

export default function PanelResizer({ direction = "horizontal", onResize }: Props) {
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onResizeRef.current = onResize;
  });

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    let startPos = direction === "horizontal" ? e.clientX : e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.classList.add("panel-resizer--dragging");
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      const current = direction === "horizontal" ? ev.clientX : ev.clientY;
      const delta = current - startPos;
      startPos = current;
      onResizeRef.current(delta);
    }

    function onUp() {
      el.classList.remove("panel-resizer--dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`panel-resizer ${direction === "vertical" ? "panel-resizer--horizontal" : ""}`}
      onMouseDown={handleMouseDown}
    />
  );
}
