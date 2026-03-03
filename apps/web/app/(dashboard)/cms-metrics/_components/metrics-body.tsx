"use client";

import type { CmsMetrics } from "@/lib/services/cms";
import { FONT, HIDDEN_EMAILS, HIDDEN_NAMES, pct } from "./helpers";
import { FunnelStep } from "./funnel-step";
import { OperatorCard } from "./operator-card";
import { TimeCard } from "./time-card";
import { ClockIcon } from "./clock-icon";

/* ── Funnel icons (inline to keep components self-contained) ── */

function PendingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
    </svg>
  );
}

/* ── Main exported component ── */

export function MetricsBody({ metrics }: { metrics: CmsMetrics }) {
  const g = metrics.global_totals;
  const contacted = g.hablados + g.respondieron;
  const tm = metrics.time_metrics;

  const visibleOperators = metrics.operators.filter(
    (op) => !HIDDEN_EMAILS.has(op.email.toLowerCase()) && !HIDDEN_NAMES.has(op.full_name),
  );
  const maxWorked = Math.max(
    1,
    ...visibleOperators.map((op) => op.hablados + op.respondieron + op.archivados),
  );
  const sortedOperators = [...visibleOperators].sort(
    (a, b) =>
      b.hablados + b.respondieron + b.archivados - (a.hablados + a.respondieron + a.archivados),
  );

  return (
    <>
      {/* ── Funnel ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, alignItems: "stretch" }}>
        <FunnelStep label="Pendientes" count={g.nuevos} total={g.total} color="#ef4444" icon={<PendingIcon />} />
        <FunnelStep label="Hablados" count={g.hablados} total={g.total} color="#16a34a" icon={<PhoneIcon />} />
        <FunnelStep label="Contestaron" count={g.respondieron} total={g.total} color="#7c3aed" icon={<CheckIcon />} />
        <FunnelStep label="Archivados" count={g.archivados} total={g.total} color="#9ca3af" icon={<ArchiveIcon />} isLast />
      </div>

      {/* ── Conversion Summary ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 200px",
            background: "#f0fdf4",
            borderRadius: 12,
            padding: "16px 20px",
            border: "1px solid #bbf7d0",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#166534",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            Tasa de Contacto
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#16a34a", lineHeight: 1 }}>
            {pct(contacted, g.total)}%
          </div>
          <div style={{ fontSize: 11, color: "#166534", marginTop: 4 }}>
            {contacted} de {g.total} contactados
          </div>
        </div>

        <div
          style={{
            flex: "1 1 200px",
            background: "#f5f3ff",
            borderRadius: 12,
            padding: "16px 20px",
            border: "1px solid #ddd6fe",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#5b21b6",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            Tasa de Respuesta
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#7c3aed", lineHeight: 1 }}>
            {pct(g.respondieron, contacted)}%
          </div>
          <div style={{ fontSize: 11, color: "#5b21b6", marginTop: 4 }}>
            {g.respondieron} de {contacted} respondieron
          </div>
        </div>

        <div
          style={{
            flex: "1 1 200px",
            background: "var(--goberna-blue-50, #eff6ff)",
            borderRadius: 12,
            padding: "16px 20px",
            border: "1px solid var(--goberna-blue-200, #bfdbfe)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--goberna-blue-900)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            Eficiencia Global
          </div>
          <div
            style={{ fontSize: 32, fontWeight: 800, color: "var(--goberna-blue-600, #2563eb)", lineHeight: 1 }}
          >
            {pct(g.respondieron, g.total)}%
          </div>
          <div style={{ fontSize: 11, color: "var(--goberna-blue-900)", marginTop: 4 }}>
            {g.respondieron} respuestas de {g.total} total
          </div>
        </div>
      </div>

      {/* ── Time Metrics ─────────────────────────────────────────────── */}
      {tm && (tm.total_with_hablado > 0 || tm.total_with_respondieron > 0) && (
        <>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 14px",
              letterSpacing: "0.02em",
            }}
          >
            TIEMPOS DE GESTION
          </h2>
          <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
            <TimeCard
              label="WSP → Hablado"
              avg={tm.avg_claim_to_hablado_mins}
              median={tm.median_claim_to_hablado_mins}
              count={tm.total_with_hablado}
              color="#16a34a"
              icon={<ClockIcon color="#16a34a" />}
            />
            <TimeCard
              label="Hablado → Contesto"
              avg={tm.avg_hablado_to_respondieron_mins}
              median={tm.median_hablado_to_respondieron_mins}
              count={tm.total_with_respondieron}
              color="#7c3aed"
              icon={<ClockIcon color="#7c3aed" />}
            />
          </div>
        </>
      )}

      {/* ── Operators ────────────────────────────────────────────────── */}
      <h2
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: "var(--color-text-primary)",
          margin: "0 0 14px",
          letterSpacing: "0.02em",
          fontFamily: FONT,
        }}
      >
        AGENTES DIGITALES
        <span
          style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", marginLeft: 8 }}
        >
          {sortedOperators.length} activo{sortedOperators.length !== 1 ? "s" : ""}
        </span>
      </h2>

      {sortedOperators.length === 0 ? (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-tertiary)",
            fontSize: 14,
          }}
        >
          Sin agentes digitales activos
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 12,
          }}
        >
          {sortedOperators.map((op) => (
            <OperatorCard
              key={`${op.user_id}-${op.campaign_id}`}
              op={op}
              maxWorked={maxWorked}
            />
          ))}
        </div>
      )}

      <div style={{ height: 48 }} />
    </>
  );
}
