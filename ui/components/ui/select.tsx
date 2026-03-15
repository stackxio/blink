import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Select;

const SelectGroup = SelectPrimitive.SelectGroup;

const SelectValue = SelectPrimitive.SelectValue;

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.SelectTrigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.SelectTrigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.SelectTrigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.SelectIcon asChild>
      <ChevronDownIcon className="size-4 opacity-50" />
    </SelectPrimitive.SelectIcon>
  </SelectPrimitive.SelectTrigger>
));
SelectTrigger.displayName = SelectPrimitive.SelectTrigger.displayName ?? "SelectTrigger";

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.SelectContent>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.SelectContent>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.SelectPortal>
    <SelectPrimitive.SelectContent
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.SelectViewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.SelectViewport>
    </SelectPrimitive.SelectContent>
  </SelectPrimitive.SelectPortal>
));
SelectContent.displayName = SelectPrimitive.SelectContent.displayName ?? "SelectContent";

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.SelectItem>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.SelectItem>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.SelectItem
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.SelectItemIndicator>
        <CheckIcon className="size-4" />
      </SelectPrimitive.SelectItemIndicator>
    </span>
    <SelectPrimitive.SelectItemText>{children}</SelectPrimitive.SelectItemText>
  </SelectPrimitive.SelectItem>
));
SelectItem.displayName = SelectPrimitive.SelectItem.displayName ?? "SelectItem";

const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.SelectLabel>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.SelectLabel>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.SelectLabel
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.SelectLabel.displayName ?? "SelectLabel";

const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.SelectSeparator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.SelectSeparator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.SelectSeparator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.SelectSeparator.displayName ?? "SelectSeparator";

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};
