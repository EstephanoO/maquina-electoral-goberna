"use client";

import type { CmsSourceMetrics } from "@/lib/services/cms";
import { FONT } from "./helpers";

const SOURCE_META: Record<
  CmsSourceMetrics["source"],
  { label: string; emoji: string; accentColor: string; bgColor: string; borderColor: string }
> = {
  territorio: {
    label: "Territorio",
    emoji: "📍",
    accentColor: "#16a34a",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  meta: {
    label: "Meta Ads",
    emoji: "📘",
    accentColor: "#1877f2",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  manual: {
    label: "Manual",
    emoji: "✏️",
    accentColor: "#d97706",
    bgColor: "#fffbeb",
    borderColor: "#fde68a",
  },
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: "var(--color-border)",
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

export function SourceCard({
  source,
  maxTotal,
}: {
  source: CmsSourceMetrics;
  /** Max total across all sources — used to normalise the bar */
  maxTotal: number;
}) {
  const meta = SOURCE_META[source.source];
  const contacted = source.hablados + source.respondieron;
  const contactPct = source.total > 0 ? Math.round((contacted / source.total) * 100) : 0;
  const responsePct = contacted > 0 ? Math.round((source.respondieron / contacted) * 100) : 0;

  return (
    <div
      style={{
        background: meta.bgColor,
        border: `1px solid ${meta.borderColor}`,
        borderRadius: 14,
        padding: "18px 20px",
        fontFamily: FONT,
        flex: "1 1 220px",
        minWidth: 220,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 22 }}>{meta.emoji}</span>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: meta.accentColor,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {meta.label}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {source.total.toLocaleString("es-PE")} contactos
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div
            style={{ fontSize: 26, fontWeight: 800, color: meta.accentColor, lineHeight: 1 }}
          >
            {contactPct}%
          </div>
          <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", fontWeight: 600, textTransform: "uppercase" }}>
            contacto
          </div>
        </div>
      </div>

      {/* Volume bar (relative to max source) */}
      <Bar value={source.total} max={maxTotal} color={meta.accentColor} />

      {/* Pipeline stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 16px",
          marginTop: 14,
        }}
      >
        {[
          { label: "Pendientes",   val: source.nuevos,       color: "#ef4444" },
          { label: "Hablados",     val: source.hablados,     color: "#16a34a" },
          { label: "Contestaron",  val: source.respondieron, color: "#7c3aed" },
          { label: "Archivados",   val: source.archivados,   color: "#9ca3af" },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>
              {s.val.toLocaleString("es-PE")}
            </div>
            <div
              style={{
                fontSize: 9,
                color: "var(--color-text-tertiary)",
                fontWeight: 600,
                textTransform: "uppercase",
                marginTop: 1,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Rates footer */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${meta.borderColor}`,
          display: "flex",
          gap: 16,
          fontSize: 11,
        }}
      >
        <div>
          <span style={{ color: "var(--color-text-tertiary)" }}>Contacto </span>
          <strong style={{ color: meta.accentColor }}>{contactPct}%</strong>
        </div>
        <div>
          <span style={{ color: "var(--color-text-tertiary)" }}>Respuesta </span>
          <strong style={{ color: "#7c3aed" }}>{responsePct}%</strong>
        </div>
      </div>
    </div>
  );
}
