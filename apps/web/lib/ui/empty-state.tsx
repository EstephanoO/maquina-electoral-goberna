/**
 * GOBERNA — EmptyState Component
 * Display when no data is available.
 */

import type { CSSProperties, ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const containerStyle: CSSProperties = {
    textAlign: "center",
    padding: "48px 24px",
    color: "var(--color-text-tertiary)",
  };

  const iconStyle: CSSProperties = {
    marginBottom: 16,
    opacity: 0.5,
  };

  const titleStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
    marginBottom: description ? 4 : 0,
  };

  const descStyle: CSSProperties = {
    fontSize: 13,
    margin: 0,
  };

  const actionStyle: CSSProperties = {
    marginTop: 16,
  };

  return (
    <div style={containerStyle}>
      {icon && <div style={iconStyle}>{icon}</div>}
      <p style={titleStyle}>{title}</p>
      {description && <p style={descStyle}>{description}</p>}
      {action && <div style={actionStyle}>{action}</div>}
    </div>
  );
}

// ── Preset Icons ───────────────────────────────────────────────────

export function CheckCircleIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-border-strong)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Sin datos</title>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-border-strong)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Sin usuarios</title>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
