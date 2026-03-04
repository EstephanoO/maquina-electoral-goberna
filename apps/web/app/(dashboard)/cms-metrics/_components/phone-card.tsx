"use client";

import type { CmsWaPhoneMetrics } from "@/lib/services/cms";
import { pct } from "./helpers";

/** Formats a raw WA number (e.g. "51906218514") to a readable form "+51 906 218 514" */
function fmtPhone(raw: string): string {
  if (!raw || raw === "desconocido") return raw || "Desconocido";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("51")) {
    // Peruvian: 51 + 9 digits
    return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}

export function PhoneCard({
  phone,
  maxTotal,
  rank,
  alias,
}: {
  phone: CmsWaPhoneMetrics;
  maxTotal: number;
  rank: number;
  alias?: string;
}) {
  const contacted = phone.hablados + phone.respondieron;
  const contactPct = Number(pct(contacted, phone.total_interactions));
  const responsePct = Number(pct(phone.respondieron, contacted));

  const segments = [
    { count: phone.respondieron, color: "#7c3aed", label: "Contestaron" },
    { count: phone.hablados, color: "#16a34a", label: "Hablados" },
    { count: phone.archivados, color: "#9ca3af", label: "Archiv." },
  ];

  const barFill = maxTotal > 0 ? (phone.total_interactions / maxTotal) * 100 : 0;

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 12,
        padding: "16px 20px",
        border: "1px solid var(--color-border)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* rank badge */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 14,
          fontSize: 11,
          fontWeight: 700,
          color: "var(--color-text-tertiary)",
          letterSpacing: "0.04em",
        }}
      >
        #{rank}
      </div>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#dcfce7",
            color: "#16a34a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          📱
        </div>
        <div>
          {alias && (
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-primary)", lineHeight: 1.2 }}>
              {alias}
            </div>
          )}
          <div style={{ fontSize: alias ? 11 : 14, fontWeight: alias ? 500 : 700, color: alias ? "var(--color-text-secondary)" : "var(--color-text-primary)", fontFamily: "monospace" }}>
            {fmtPhone(phone.wa_number)}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {phone.total_interactions} interacciones totales
          </div>
        </div>
      </div>

      {/* Relative bar vs max phone */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--color-border)",
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: `${barFill}%`,
            height: "100%",
            background: "var(--goberna-blue-600, #2563eb)",
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Stats grid */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
        {[
          { val: phone.hablados,     label: "Hablados",    color: "#16a34a" },
          { val: phone.respondieron, label: "Contestaron", color: "#7c3aed" },
          { val: phone.archivados,   label: "Archivados",  color: "#9ca3af" },
          { val: `${contactPct}%`,   label: "Contacto",    color: "#2563eb" },
          { val: `${responsePct}%`,  label: "Respuesta",   color: "#7c3aed" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              textAlign: "center",
              borderRight: "1px solid var(--color-border)",
              padding: "4px 0",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>
              {s.val}
            </div>
            <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", marginTop: 2, fontWeight: 600, textTransform: "uppercase" }}>
              {s.label}
            </div>
          </div>
        ))}
        {/* remove last border */}
        <style>{`.phone-card-last > div:last-child { border-right: none !important; }`}</style>
      </div>

      {/* Stacked mini progress bar */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--color-border)",
          overflow: "hidden",
          display: "flex",
        }}
      >
        {segments.map((s) => {
          const segPct =
            phone.total_interactions > 0
              ? (s.count / phone.total_interactions) * 100
              : 0;
          return segPct > 0 ? (
            <div
              key={s.label}
              style={{ width: `${segPct}%`, height: "100%", background: s.color }}
              title={`${s.label}: ${s.count}`}
            />
          ) : null;
        })}
      </div>

      {/* Legend pills */}
      <div style={{ display: "flex", gap: 12, fontSize: 10, marginTop: 8 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: s.color,
                display: "inline-block",
              }}
            />
            <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
