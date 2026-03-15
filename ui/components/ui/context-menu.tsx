import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ContextMenu = ContextMenuPrimitive.ContextMenu;

const ContextMenuTrigger = ContextMenuPrimitive.ContextMenuTrigger;

const ContextMenuGroup = ContextMenuPrimitive.ContextMenuGroup;

const ContextMenuPortal = ContextMenuPrimitive.ContextMenuPortal;

const ContextMenuSub = ContextMenuPrimitive.ContextMenuSub;

const ContextMenuRadioGroup = ContextMenuPrimitive.ContextMenuRadioGroup;

const ContextMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.ContextMenuSubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.ContextMenuSubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.ContextMenuSubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto size-4" />
  </ContextMenuPrimitive.ContextMenuSubTrigger>
));
ContextMenuSubTrigger.displayName =
  ContextMenuPrimitive.ContextMenuSubTrigger.displayName ?? "ContextMenuSubTrigger";

const ContextMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.ContextMenuSubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.ContextMenuSubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.ContextMenuSubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg",
      className
    )}
    {...props}
  />
));
ContextMenuSubContent.displayName =
  ContextMenuPrimitive.ContextMenuSubContent.displayName ?? "ContextMenuSubContent";

const ContextMenuContent = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.ContextMenuContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.ContextMenuContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.ContextMenuPortal>
    <ContextMenuPrimitive.ContextMenuContent
      ref={ref}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
        className
      )}
      {...props}
    />
  </ContextMenuPrimitive.ContextMenuPortal>
));
ContextMenuContent.displayName =
  ContextMenuPrimitive.ContextMenuContent.displayName ?? "ContextMenuContent";

const ContextMenuItem = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.ContextMenuItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.ContextMenuItem> & {
    inset?: boolean;
    variant?: "default" | "destructive";
  }
>(({ className, inset, variant = "default", ...props }, ref) => (
  <ContextMenuPrimitive.ContextMenuItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      variant === "destructive" &&
        "focus:bg-destructive/10 focus:text-destructive data-[disabled]:opacity-50",
      className
    )}
    {...props}
  />
));
ContextMenuItem.displayName =
  ContextMenuPrimitive.ContextMenuItem.displayName ?? "ContextMenuItem";

const ContextMenuLabel = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.ContextMenuLabel>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.ContextMenuLabel> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.ContextMenuLabel
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
ContextMenuLabel.displayName =
  ContextMenuPrimitive.ContextMenuLabel.displayName ?? "ContextMenuLabel";

const ContextMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof ContextMenuPrimitive.ContextMenuSeparator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.ContextMenuSeparator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.ContextMenuSeparator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
ContextMenuSeparator.displayName =
  ContextMenuPrimitive.ContextMenuSeparator.displayName ?? "ContextMenuSeparator";

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
