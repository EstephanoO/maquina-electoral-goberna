/**
 * GOBERNA — Button Component
 * Consistent button styling with variants.
 */

import type { CSSProperties, ReactNode, ButtonHTMLAttributes } from "react";
import { FONT_STACK } from "../constants";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
};

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--goberna-gold)",
    color: "#fff",
    border: "none",
  },
  secondary: {
    background: "var(--goberna-blue-50)",
    color: "var(--goberna-blue-700)",
    border: "1px solid var(--goberna-blue-200)",
  },
  danger: {
    background: "var(--color-error)",
    color: "#fff",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text-secondary)",
    border: "none",
  },
};

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  sm: { padding: "6px 14px", fontSize: 12 },
  md: { padding: "8px 20px", fontSize: 13 },
  lg: { padding: "12px 24px", fontSize: 14 },
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  fullWidth,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const buttonStyle: CSSProperties = {
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    fontWeight: 700,
    fontFamily: FONT_STACK,
    borderRadius: "var(--radius-sm)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    transition: "all .15s ease",
    opacity: isDisabled ? 0.6 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: fullWidth ? "100%" : undefined,
    ...style,
  };

  return (
    <button type="button" disabled={isDisabled} style={buttonStyle} {...props}>
      {loading && <Spinner size={14} color="currentColor" />}
      {children}
    </button>
  );
}
