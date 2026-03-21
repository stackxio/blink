import * as React from "react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const cls = ["input", className].filter(Boolean).join(" ");
    return <input type={type} className={cls} ref={ref} {...props} />;
  },
);
Input.displayName = "Input";

export { Input };
