"use client";

import type { CmsDeviceMetrics } from "@/lib/services/cms";
import { pct, FONT } from "./helpers";

/** Formats a raw WA number (e.g. "51906218514") → "+51 906 218 514" */
function fmtPhone(raw: string): string {
  if (!raw || raw === "desconocido") return raw || "Desconocido";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("51")) {
    return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}

/** Returns initials from an email address, e.g. "ana.gomez@…" → "AG" */
function emailInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0]![0] ?? "").toUpperCase() + (parts[1]![0] ?? "").toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

/** Returns relative time string, e.g. "hace 3 min" */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

export function DeviceCard({
  device,
  rank,
}: {
  device: CmsDeviceMetrics;
  rank: number;
}) {
  const isActive = device.active_operator_id !== null;
  const contacted = device.hablados + device.respondieron;
  const total = device.hablados + device.respondieron + device.archivados;

  const segments = [
    { count: device.respondieron, color: "#7c3aed", label: "Contestaron" },
    { count: device.hablados, color: "#16a34a", label: "Hablados" },
    { count: device.archivados, color: "#9ca3af", label: "Archiv." },
  ];

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 12,
        padding: "16px 20px",
        border: isActive
          ? "1.5px solid #bbf7d0"
          : "1px solid var(--color-border)",
        position: "relative",
        overflow: "hidden",
        fontFamily: FONT,
        minWidth: 260,
        flex: "0 0 260px",
      }}
    >
      {/* Active pulse indicator */}
      {isActive && (
        <span
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            fontWeight: 700,
            color: "#16a34a",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#16a34a",
              boxShadow: "0 0 0 2px #bbf7d0",
              display: "inline-block",
              animation: "pulse-dot 1.6s ease-in-out infinite",
            }}
          />
          ACTIVO
          <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
        </span>
      )}

      {/* Rank when inactive */}
      {!isActive && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-text-tertiary)",
          }}
        >
          #{rank}
        </div>
      )}

      {/* Header: device name + phone */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: isActive ? "#dcfce7" : "var(--color-border)",
            color: isActive ? "#16a34a" : "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          📱
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
            }}
          >
            {device.label}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--color-text-secondary)",
              fontFamily: "monospace",
            }}
          >
            {fmtPhone(device.wa_number)}
          </div>
        </div>
      </div>

      {/* Active operator badge */}
      {isActive && device.active_operator_email && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "7px 10px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#16a34a",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {emailInitials(device.active_operator_email)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#166534",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {device.active_operator_email.split("@")[0]}
            </div>
            <div style={{ fontSize: 10, color: "#16a34a" }}>
              {relativeTime(device.active_since)}
            </div>
          </div>
        </div>
      )}

      {/* Idle state */}
      {!isActive && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--color-border)",
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 14,
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-text-tertiary)",
              display: "inline-block",
              opacity: 0.5,
            }}
          />
          Sin operador activo
          {device.total_operators > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 10 }}>
              {device.total_operators} operador{device.total_operators !== 1 ? "es" : ""} hist.
            </span>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
        {[
          { val: device.hablados,     label: "Hablados",    color: "#16a34a" },
          { val: device.respondieron, label: "Contestaron", color: "#7c3aed" },
          { val: device.archivados,   label: "Archivados",  color: "#9ca3af" },
          { val: `${pct(contacted, total)}%`, label: "Contacto", color: "#2563eb" },
        ].map((s, i, arr) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              textAlign: "center",
              borderRight: i < arr.length - 1 ? "1px solid var(--color-border)" : "none",
              padding: "4px 0",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>
              {s.val}
            </div>
            <div
              style={{
                fontSize: 9,
                color: "var(--color-text-tertiary)",
                marginTop: 2,
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Stacked progress bar */}
      <div
        style={{
          height: 5,
          borderRadius: 3,
          background: "var(--color-border)",
          overflow: "hidden",
          display: "flex",
        }}
      >
        {segments.map((s) => {
          const segPct = total > 0 ? (s.count / total) * 100 : 0;
          return segPct > 0 ? (
            <div
              key={s.label}
              style={{ width: `${segPct}%`, height: "100%", background: s.color }}
              title={`${s.label}: ${s.count}`}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
