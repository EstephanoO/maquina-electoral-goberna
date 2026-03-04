"use client";

import { formatMins, FONT } from "./helpers";

export function TimeCard({
  label,
  avg,
  median,
  count,
  color,
  icon,
}: {
  label: string;
  avg: number | null;
  median: number | null;
  count: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 12,
        padding: "18px 20px",
        border: "1px solid var(--color-border)",
        fontFamily: FONT,
        flex: "1 1 260px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${color}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: 32, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{formatMins(avg)}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 3, fontWeight: 600 }}>
            promedio
          </div>
        </div>
        <div>
          <div
            style={{ fontSize: 26, fontWeight: 800, color: "var(--color-text-secondary)", lineHeight: 1 }}
          >
            {formatMins(median)}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 3, fontWeight: 600 }}>
            mediana
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          paddingTop: 10,
          borderTop: "1px solid var(--color-border)",
        }}
      >
        {count} contacto{count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
