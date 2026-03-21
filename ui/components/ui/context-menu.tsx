import * as React from "react";
import { createPortal } from "react-dom";

// ── Context ──
const MenuCtx = React.createContext<{ close: () => void }>({ close: () => {} });

// ── Root ──
function ContextMenu({ children }: { children: React.ReactNode }) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

  return (
    <ContextMenuOpenCtx.Provider value={{ pos, setPos }}>
      <MenuCtx.Provider value={{ close: () => setPos(null) }}>
        {children}
      </MenuCtx.Provider>
    </ContextMenuOpenCtx.Provider>
  );
}

const ContextMenuOpenCtx = React.createContext<{
  pos: { x: number; y: number } | null;
  setPos: (p: { x: number; y: number } | null) => void;
}>({ pos: null, setPos: () => {} });

// ── Trigger ──
function ContextMenuTrigger({ children, asChild: _ }: { children: React.ReactNode; asChild?: boolean }) {
  const { setPos } = React.useContext(ContextMenuOpenCtx);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
  }

  if (React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      onContextMenu: handleContextMenu,
    });
  }

  return <div onContextMenu={handleContextMenu}>{children}</div>;
}

// ── Content ──
function ContextMenuContent({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { pos, setPos } = React.useContext(ContextMenuOpenCtx);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!pos) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPos(null);
    }
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pos, setPos]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={ref}
      className={["menu", className].filter(Boolean).join(" ")}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 200 }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}

// ── Item ──
function ContextMenuItem({
  children,
  onSelect,
  onClick,
  className,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  onSelect?: () => void;
  variant?: "default" | "destructive";
}) {
  const { close } = React.useContext(MenuCtx);
  return (
    <button
      type="button"
      className={[
        "menu__item",
        variant === "destructive" && "menu__item--danger",
        className,
      ].filter(Boolean).join(" ")}
      onClick={(e) => {
        onClick?.(e);
        onSelect?.();
        close();
      }}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Separator ──
function ContextMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={["menu__separator", className].filter(Boolean).join(" ")} {...props} />;
}

// ── Passthrough exports for API compat ──
const ContextMenuGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ContextMenuPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ContextMenuSub = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ContextMenuSubTrigger = ContextMenuItem;
const ContextMenuSubContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ContextMenuRadioGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ContextMenuLabel = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={["menu__label", className].filter(Boolean).join(" ")} {...props}>{children}</div>
);

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
