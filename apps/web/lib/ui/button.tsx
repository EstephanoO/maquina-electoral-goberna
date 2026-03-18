import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  "btn inline-flex items-center justify-center font-semibold font-sans tracking-[0.01em] leading-snug cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 transition-all",
  {
    variants: {
      variant: {
        primary: "btn-primary bg-primary text-text-on-primary border-none",
        accent: "btn-accent bg-accent text-text-on-accent border-none",
        secondary: "btn-secondary bg-surface text-goberna-blue-700 border border-border",
        danger: "btn-danger bg-error text-white border-none",
        ghost: "btn-ghost bg-transparent text-text-secondary border border-transparent",
      },
      size: {
        xs: "px-2.5 py-1 text-[11px] gap-1 rounded-sm",
        sm: "px-3.5 py-1.5 text-xs gap-1.5 rounded-sm",
        md: "px-5 py-2 text-[13px] gap-2 rounded-sm",
        lg: "px-7 py-3 text-sm gap-2.5 rounded-md",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    icon?: ReactNode;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, fullWidth, loading, disabled, icon, children, className, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        {...props}
      >
        {loading && <Spinner size={size === "lg" ? "sm" : "xs"} className="border-current border-t-transparent" />}
        {!loading && icon && <span className="flex items-center shrink-0">{icon}</span>}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
export type { ButtonProps };
