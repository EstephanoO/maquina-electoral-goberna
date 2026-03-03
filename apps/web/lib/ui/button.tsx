/**
 * GOBERNA — Button Component v2
 * Consistent button styling with proper CSS hover/active states.
 */

import type { CSSProperties, ReactNode, ButtonHTMLAttributes } from "react";
import { FONT_STACK } from "../constants";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "accent" | "secondary" | "danger" | "ghost";
type ButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--color-primary)",
    color: "var(--color-text-on-primary)",
    border: "none",
  },
  accent: {
    background: "var(--goberna-gold)",
    color: "var(--color-text-on-accent)",
    border: "none",
  },
  secondary: {
    background: "var(--color-surface)",
    color: "var(--goberna-blue-700)",
    border: "1px solid var(--color-border)",
  },
  danger: {
    background: "var(--color-error)",
    color: "#fff",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid transparent",
  },
};

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  xs: { padding: "4px 10px", fontSize: 11, gap: 4 },
  sm: { padding: "6px 14px", fontSize: 12, gap: 6 },
  md: { padding: "8px 20px", fontSize: 13, gap: 8 },
  lg: { padding: "12px 28px", fontSize: 14, gap: 10 },
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  accent: "btn-accent",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  fullWidth,
  disabled,
  icon,
  children,
  style,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const buttonStyle: CSSProperties = {
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    fontWeight: 600,
    fontFamily: FONT_STACK,
    borderRadius: "var(--radius-sm)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.55 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: fullWidth ? "100%" : undefined,
    lineHeight: 1.4,
    letterSpacing: "0.01em",
    ...style,
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`btn ${VARIANT_CLASS[variant]}${className ? ` ${className}` : ""}`}
      style={buttonStyle}
      {...props}
    >
      {loading && <Spinner size={size === "lg" ? 16 : 14} color="currentColor" />}
      {!loading && icon && <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>}
      {children}
    </button>
  );
}
