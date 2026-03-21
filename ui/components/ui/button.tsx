import * as React from "react";

type Variant = "default" | "secondary" | "ghost" | "outline" | "destructive" | "link";
type Size = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const VARIANT_CLS: Record<Variant, string> = {
  default: "btn--default",
  secondary: "btn--secondary",
  ghost: "btn--ghost",
  outline: "btn--outline",
  destructive: "btn--danger",
  link: "btn--link",
};

const SIZE_CLS: Record<Size, string> = {
  default: "btn--md",
  sm: "btn--sm",
  lg: "btn--lg",
  icon: "btn--icon",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild: _, ...props }, ref) => {
    const cls = ["btn", VARIANT_CLS[variant], SIZE_CLS[size], className].filter(Boolean).join(" ");
    return <button ref={ref} className={cls} {...props} />;
  },
);
Button.displayName = "Button";

export { Button };
