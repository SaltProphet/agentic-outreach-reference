import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-sm bg-bg px-3 text-sm text-fg placeholder:text-subtle shadow-[var(--shadow-border)]",
          "transition-[box-shadow] duration-150 ease-out hover:shadow-[var(--shadow-border-hover)]",
          "focus-visible:shadow-[0_0_0_1px_var(--color-accent)]",
          className,
        )}
        {...props}
      />
    );
  },
);
