import * as React from "react";
import { createPortal } from "react-dom";

// ── Context ──
const MenuCtx = React.createContext<{
  close: () => void;
}>({ close: () => {} });

// ── Root ──
function DropdownMenu({ children, open, onOpenChange }: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <MenuCtx.Provider value={{ close: () => setOpen(false) }}>
      <DropdownOpenCtx.Provider value={{ isOpen, setOpen }}>
        {children}
      </DropdownOpenCtx.Provider>
    </MenuCtx.Provider>
  );
}

const DropdownOpenCtx = React.createContext<{
  isOpen: boolean;
  setOpen: (v: boolean) => void;
}>({ isOpen: false, setOpen: () => {} });

// ── Trigger ──
function DropdownMenuTrigger({ children, asChild: _ }: { children: React.ReactNode; asChild?: boolean }) {
  const { isOpen, setOpen } = React.useContext(DropdownOpenCtx);
  const ref = React.useRef<HTMLButtonElement>(null);

  if (React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      ref,
      onClick: (e: React.MouseEvent) => {
        (children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>).props.onClick?.(e);
        setOpen(!isOpen);
      },
    });
  }

  return (
    <button ref={ref} type="button" onClick={() => setOpen(!isOpen)}>
      {children}
    </button>
  );
}

// ── Content ──
function DropdownMenuContent({
  children,
  align = "start",
  className,
  onCloseAutoFocus,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "end" | "center";
  sideOffset?: number;
  onCloseAutoFocus?: () => void;
}) {
  const { isOpen, setOpen } = React.useContext(DropdownOpenCtx);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        onCloseAutoFocus?.();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        onCloseAutoFocus?.();
      }
    }
    // Delay to avoid the trigger click from immediately closing
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, setOpen, onCloseAutoFocus]);

  if (!isOpen) return null;

  return createPortal(
    <div ref={ref} className={["menu", className].filter(Boolean).join(" ")} style={{ position: "fixed", zIndex: 200 }} {...props}>
      {children}
    </div>,
    document.body,
  );
}

// ── Item ──
function DropdownMenuItem({
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

// ── Label ──
function DropdownMenuLabel({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={["menu__label", className].filter(Boolean).join(" ")} {...props}>{children}</div>;
}

// ── Separator ──
function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={["menu__separator", className].filter(Boolean).join(" ")} {...props} />;
}

// ── Sub menu (simplified — opens inline) ──
function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownSubCtx.Provider value={{ open, setOpen }}>
      {children}
    </DropdownSubCtx.Provider>
  );
}

const DropdownSubCtx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

function DropdownMenuSubTrigger({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = React.useContext(DropdownSubCtx);
  return (
    <button
      type="button"
      className={["menu__sub-trigger", className].filter(Boolean).join(" ")}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownMenuSubContent({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = React.useContext(DropdownSubCtx);
  if (!open) return null;
  return (
    <div className={["menu", className].filter(Boolean).join(" ")} style={{ position: "relative", boxShadow: "none", border: "none", padding: "0 0 0 8px" }} {...props}>
      {children}
    </div>
  );
}

// ── Radio group ──
function DropdownMenuRadioGroup({
  children,
  value,
  onValueChange,
}: {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  return (
    <RadioCtx.Provider value={{ value: value ?? "", onValueChange: onValueChange ?? (() => {}) }}>
      {children}
    </RadioCtx.Provider>
  );
}

const RadioCtx = React.createContext<{ value: string; onValueChange: (v: string) => void }>({
  value: "",
  onValueChange: () => {},
});

function DropdownMenuRadioItem({
  children,
  value,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: current, onValueChange } = React.useContext(RadioCtx);
  const { close } = React.useContext(MenuCtx);
  const checked = current === value;
  return (
    <button
      type="button"
      className={[
        "menu__radio-item",
        checked && "menu__radio-item--checked",
        className,
      ].filter(Boolean).join(" ")}
      onClick={() => { onValueChange(value); close(); }}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Exports (matching shadcn API) ──
const DropdownMenuGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuShortcut = ({ children, className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={className} style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.6 }} {...props}>{children}</span>
);
const DropdownMenuCheckboxItem = DropdownMenuItem;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
