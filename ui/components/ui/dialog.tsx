import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const Dialog = DialogPrimitive.Dialog;

const DialogTrigger = DialogPrimitive.DialogTrigger;

const DialogPortal = DialogPrimitive.DialogPortal;

const DialogClose = DialogPrimitive.DialogClose;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.DialogOverlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.DialogOverlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.DialogOverlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.DialogOverlay.displayName ?? "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.DialogContent> & {
    showCloseButton?: boolean;
  }
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.DialogContent
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg transition-all duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 data-[state=closed]:scale-95 data-[state=open]:scale-100 sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.DialogClose
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          )}
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </DialogPrimitive.DialogClose>
      ) : null}
    </DialogPrimitive.DialogContent>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.DialogContent.displayName ?? "DialogContent";

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.DialogTitle>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.DialogTitle>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.DialogTitle
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.DialogTitle.displayName ?? "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.DialogDescription>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.DialogDescription>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.DialogDescription
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName =
  DialogPrimitive.DialogDescription.displayName ?? "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
