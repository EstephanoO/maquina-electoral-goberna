/**
 * GOBERNA — Alert Component v2
 * Display error, warning, success, or info messages with proper semantic tokens.
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
    background: "var(--color-error-bg)",
    color: "var(--color-error)",
    borderColor: "var(--color-error-border)",
  },
  warning: {
    background: "var(--color-warning-bg)",
    color: "var(--color-warning)",
    borderColor: "var(--color-warning-border)",
  },
  success: {
    background: "var(--color-success-bg)",
    color: "var(--color-success)",
    borderColor: "var(--color-success-border)",
  },
  info: {
    background: "var(--color-info-bg)",
    color: "var(--goberna-blue-700)",
    borderColor: "var(--color-info-border)",
  },
};

const VARIANT_ICONS: Record<AlertVariant, React.ReactNode> = {
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export function Alert({ variant = "error", message, onDismiss }: AlertProps) {
  const style: CSSProperties = {
    ...VARIANT_STYLES[variant],
    fontSize: 13,
    fontWeight: 500,
    padding: "10px 14px",
    borderRadius: "var(--radius-md)",
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  return (
    <div style={style} role="alert" className="animate-fade-in">
      <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{VARIANT_ICONS[variant]}</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            color: "inherit",
            opacity: 0.6,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            transition: "opacity var(--duration-fast) ease",
          }}
          aria-label="Cerrar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
