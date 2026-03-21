import * as React from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

// ── Dialog root ──
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open: !!open, onClose: () => onOpenChange?.(false) }}>
      {children}
    </DialogContext.Provider>
  );
}

const DialogContext = React.createContext<{ open: boolean; onClose: () => void }>({
  open: false,
  onClose: () => {},
});

function useDialog() {
  return React.useContext(DialogContext);
}

// ── Trigger ──
function DialogTrigger({ children, asChild: _ }: { children: React.ReactNode; asChild?: boolean }) {
  // In our usage, dialogs are controlled (open/onOpenChange), so trigger is rarely needed.
  return <>{children}</>;
}

// ── Close ──
function DialogClose({
  children,
  asChild: _,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { onClose } = useDialog();
  if (React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => {
        (children as React.ReactElement<{ onClick?: () => void }>).props.onClick?.();
        onClose();
      },
    });
  }
  return (
    <button type="button" onClick={onClose} {...props}>
      {children}
    </button>
  );
}

// ── Content ──
interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  showCloseButton?: boolean;
  children: React.ReactNode;
}

function DialogContent({ children, showCloseButton = true, className, ...props }: DialogContentProps) {
  const { open, onClose } = useDialog();

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={["dialog", className].filter(Boolean).join(" ")} {...props}>
        {children}
        {showCloseButton && (
          <button type="button" className="dialog__close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Header / Footer / Title / Description ──
function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={["dialog__header", className].filter(Boolean).join(" ")} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={["dialog__footer", className].filter(Boolean).join(" ")} {...props} />;
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={["dialog__title", className].filter(Boolean).join(" ")} {...props} />;
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={["dialog__description", className].filter(Boolean).join(" ")} {...props} />;
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
