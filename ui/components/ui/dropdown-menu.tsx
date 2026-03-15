import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.DropdownMenu;

const DropdownMenuTrigger = DropdownMenuPrimitive.DropdownMenuTrigger;

const DropdownMenuGroup = DropdownMenuPrimitive.DropdownMenuGroup;

const DropdownMenuPortal = DropdownMenuPrimitive.DropdownMenuPortal;

const DropdownMenuSub = DropdownMenuPrimitive.DropdownMenuSub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.DropdownMenuRadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuSubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuSubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuSubTrigger
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
  </DropdownMenuPrimitive.DropdownMenuSubTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.DropdownMenuSubTrigger.displayName ?? "DropdownMenuSubTrigger";

const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuSubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuSubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuSubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
      className
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.DropdownMenuSubContent.displayName ?? "DropdownMenuSubContent";

const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuContent>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuPortal>
    <DropdownMenuPrimitive.DropdownMenuContent
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
        "data-[state=open]:opacity-100 data-[state=closed]:opacity-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.DropdownMenuPortal>
));
DropdownMenuContent.displayName =
  DropdownMenuPrimitive.DropdownMenuContent.displayName ?? "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuItem> & {
    inset?: boolean;
    variant?: "default" | "destructive";
  }
>(({ className, inset, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuItem
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
DropdownMenuItem.displayName =
  DropdownMenuPrimitive.DropdownMenuItem.displayName ?? "DropdownMenuItem";

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuCheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuCheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuCheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.DropdownMenuItemIndicator>
        <Check className="size-4" />
      </DropdownMenuPrimitive.DropdownMenuItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.DropdownMenuCheckboxItem>
));
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.DropdownMenuCheckboxItem.displayName ?? "DropdownMenuCheckboxItem";

const DropdownMenuRadioItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuRadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuRadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuRadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.DropdownMenuItemIndicator>
        <Circle className="size-2 fill-current" />
      </DropdownMenuPrimitive.DropdownMenuItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.DropdownMenuRadioItem>
));
DropdownMenuRadioItem.displayName =
  DropdownMenuPrimitive.DropdownMenuRadioItem.displayName ?? "DropdownMenuRadioItem";

const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuLabel>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuLabel> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuLabel
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName =
  DropdownMenuPrimitive.DropdownMenuLabel.displayName ?? "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.DropdownMenuSeparator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.DropdownMenuSeparator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.DropdownMenuSeparator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName =
  DropdownMenuPrimitive.DropdownMenuSeparator.displayName ?? "DropdownMenuSeparator";

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
    {...props}
  />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

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
