/**
 * GOBERNA — Alert Component
 * Display error or info messages.
 */

import type { CSSProperties } from "react";

type AlertVariant = "error" | "warning" | "success" | "info";

type AlertProps = {
  variant?: AlertVariant;
  message: string;
  onDismiss?: () => void;
};

const VARIANT_STYLES: Record<AlertVariant, CSSProperties> = {
  error: {
    background: "rgba(220,38,38,.08)",
    color: "var(--color-error)",
    borderColor: "rgba(220,38,38,.2)",
  },
  warning: {
    background: "var(--goberna-gold-100)",
    color: "var(--goberna-gold-700)",
    borderColor: "var(--goberna-gold-200)",
  },
  success: {
    background: "rgba(22,163,74,.08)",
    color: "var(--color-success)",
    borderColor: "rgba(22,163,74,.2)",
  },
  info: {
    background: "var(--goberna-blue-50)",
    color: "var(--goberna-blue-700)",
    borderColor: "var(--goberna-blue-200)",
  },
};

export function Alert({ variant = "error", message, onDismiss }: AlertProps) {
  const style: CSSProperties = {
    ...VARIANT_STYLES[variant],
    fontSize: 13,
    padding: "10px 14px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  return (
    <div style={style}>
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: "inherit",
            opacity: 0.7,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <title>Cerrar</title>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
