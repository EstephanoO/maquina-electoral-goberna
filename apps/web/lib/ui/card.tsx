/**
 * GOBERNA — Card Component v2
 * Surface container with consistent styling and proper hover effects.
 */

import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  style?: CSSProperties;
};

const PADDING_MAP = {
  none: "0",
  sm: "12px 16px",
  md: "16px 20px",
  lg: "24px 28px",
};

export function Card({ children, padding = "md", onClick, hoverable, className, style }: CardProps) {
  const cardStyle: CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: PADDING_MAP[padding],
    boxShadow: "var(--shadow-xs)",
    cursor: onClick || hoverable ? "pointer" : undefined,
    ...style,
  };

  const interactive = !!(onClick || hoverable);

  return (
    <div
      className={`${interactive ? "card-interactive" : ""}${className ? ` ${className}` : ""}`}
      style={cardStyle}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Stat card variant — number + label, compact.
 */
type StatCardProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: number; label?: string };
  className?: string;
};

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <Card padding="md" className={className}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-tertiary)",
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {value}
          </div>
          {trend && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginTop: 6,
                fontSize: 12,
                fontWeight: 600,
                color: trend.value >= 0 ? "var(--color-success)" : "var(--color-error)",
              }}
            >
              <span>{trend.value >= 0 ? "+" : ""}{trend.value}%</span>
              {trend.label && <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-md)",
              background: "var(--goberna-blue-50)",
              color: "var(--goberna-blue-600)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
