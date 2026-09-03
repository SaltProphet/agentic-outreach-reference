import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-[background-color,color,box-shadow,scale,opacity] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 min-h-11 px-3.5 text-sm",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-fg",
        secondary:
          "bg-transparent text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)] hover:bg-surface-hover",
        ghost: "bg-transparent text-muted hover:text-fg hover:bg-surface-hover",
        danger:
          "bg-transparent text-danger shadow-[0_0_0_1px_rgb(196_92_74_/_0.35)] hover:bg-danger-bg",
        quiet: "bg-surface text-fg hover:bg-surface-hover",
      },
      size: {
        md: "min-h-11 px-3.5",
        sm: "min-h-11 px-3 text-xs tracking-wide",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: Props) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
