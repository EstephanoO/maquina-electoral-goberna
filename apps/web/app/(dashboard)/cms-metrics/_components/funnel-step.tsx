"use client";

import { pct } from "./helpers";

export function FunnelStep({
  label,
  count,
  total,
  color,
  icon,
  isLast,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon: React.ReactNode;
  isLast?: boolean;
}) {
  const percentage = pct(count, total);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, flex: 1, minWidth: 0 }}>
      <div
        style={{
          flex: 1,
          background: "var(--color-surface)",
          borderRadius: 12,
          padding: "16px 20px",
          border: `1px solid ${color}20`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${total > 0 ? (count / total) * 100 : 0}%`,
            background: `${color}08`,
            transition: "width 0.5s ease",
          }}
        />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color, display: "flex" }}>{icon}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {label}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{count}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: `${color}99` }}>{percentage}%</span>
          </div>
        </div>
      </div>
      {!isLast && (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="2"
          style={{ flexShrink: 0, margin: "0 -2px" }}
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </div>
  );
}
