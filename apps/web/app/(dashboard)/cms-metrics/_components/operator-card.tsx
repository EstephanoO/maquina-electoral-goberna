"use client";

import type { CmsMetricsOperator } from "@/lib/services/cms";
import { FONT } from "./helpers";

export function OperatorCard({
  op,
  maxWorked,
}: {
  op: CmsMetricsOperator;
  maxWorked: number;
}) {
  const totalWorked = op.hablados + op.respondieron + op.archivados;

  const waSent = op.wa_sent ?? 0;

  const segments = [
    { count: op.respondieron, color: "#7c3aed", label: "Contestaron" },
    { count: op.hablados, color: "#16a34a", label: "Hablados" },
    { count: op.archivados, color: "#9ca3af", label: "Archivados" },
  ];

  const firstName = op.full_name.split(" ")[0] || op.email.split("@")[0] || "—";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 12,
        padding: "16px 20px",
        border: "1px solid var(--color-border)",
        fontFamily: FONT,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: totalWorked > 0 ? "var(--goberna-blue-100, #dbeafe)" : "var(--color-border)",
            color: totalWorked > 0 ? "var(--goberna-blue-600, #2563eb)" : "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {op.full_name || firstName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {op.email}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: totalWorked > 0 ? "var(--goberna-blue-600, #2563eb)" : "var(--color-text-tertiary)",
              lineHeight: 1,
            }}
          >
            {totalWorked}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 600 }}>
            gestionados
          </div>
        </div>
      </div>

      {/* Progress bar — stacked segments */}
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: "var(--color-border)",
          overflow: "hidden",
          display: "flex",
          marginBottom: 10,
        }}
      >
        {segments.map((s) => {
          const segPct = maxWorked > 0 ? (s.count / maxWorked) * 100 : 0;
          return segPct > 0 ? (
            <div
              key={s.label}
              style={{ width: `${segPct}%`, height: "100%", background: s.color, transition: "width 0.4s ease" }}
              title={`${s.label}: ${s.count}`}
            />
          ) : null;
        })}
      </div>

      {/* Breakdown pills */}
      <div style={{ display: "flex", gap: 12, fontSize: 11, flexWrap: "wrap" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }}
            />
            <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{s.count}</span>
          </div>
        ))}
        {waSent > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10 }}>💬</span>
            <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>WA enviados</span>
            <span style={{ fontWeight: 700, color: "#0ea5e9" }}>{waSent}</span>
          </div>
        )}
      </div>
    </div>
  );
}
