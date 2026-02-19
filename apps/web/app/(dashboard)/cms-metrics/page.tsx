"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../lib/auth-context";
import {
  getCmsMetrics,
  type CmsMetrics,
  type CmsMetricsCampaign,
  type CmsMetricsOperator,
  type CmsTimeMetrics,
} from "../../../lib/services/cms";

/* ═══════════════════════════════════════════════════════════════════
   GOBERNA — CMS Metrics Dashboard
   Role-scoped: admin=all, candidato=own, consultor=assigned
   ═══════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-montserrat), system-ui, sans-serif";

// ── KPI Card ────────────────────────────────────────────────────────

const TONE_BG: Record<string, string> = {
  blue: "var(--goberna-blue-100)",
  green: "#ecfdf5",
  gold: "var(--goberna-gold-100)",
  red: "#fef2f2",
  purple: "#f5f3ff",
  gray: "#f9fafb",
};

const TONE_TEXT: Record<string, string> = {
  blue: "var(--goberna-blue-600)",
  green: "#16a34a",
  gold: "var(--goberna-gold-600)",
  red: "#dc2626",
  purple: "#7c3aed",
  gray: "#6b7280",
};

function KpiCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 180px",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        boxShadow: "var(--shadow-sm)",
        border: "1px solid var(--color-border)",
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: TONE_TEXT[tone] || "var(--color-text-primary)", lineHeight: 1.1 }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ── Progress bar ────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--color-border)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color, transition: "width 0.3s ease" }} />
    </div>
  );
}

// ── Section header ──────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: FONT, margin: "32px 0 16px" }}>
      {title}
    </h2>
  );
}

// ── Campaign row ────────────────────────────────────────────────────

function CampaignRow({ c }: { c: CmsMetricsCampaign }) {
  const contacted = c.hablados + c.respondieron;
  return (
    <tr>
      <td style={tdStyle}>{c.campaign_name}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{c.total}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{c.nuevos}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{c.hablados}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{c.respondieron}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{c.archivados}</td>
      <td style={{ ...tdStyle, textAlign: "right", minWidth: 120 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: contacted > 0 ? "#16a34a" : "var(--color-text-tertiary)" }}>
            {(c.contact_rate * 100).toFixed(0)}%
          </span>
          <div style={{ width: 60 }}>
            <ProgressBar value={contacted} max={c.total} color="#16a34a" />
          </div>
        </div>
      </td>
      <td style={{ ...tdStyle, textAlign: "right", minWidth: 120 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.respondieron > 0 ? "#7c3aed" : "var(--color-text-tertiary)" }}>
            {(c.response_rate * 100).toFixed(0)}%
          </span>
          <div style={{ width: 60 }}>
            <ProgressBar value={c.respondieron} max={contacted || 1} color="#7c3aed" />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Operator row ────────────────────────────────────────────────────

function OperatorRow({ op, showCampaign }: { op: CmsMetricsOperator; showCampaign: boolean }) {
  const totalWorked = op.hablados + op.respondieron + op.archivados;
  return (
    <tr>
      <td style={tdStyle}>
        <div style={{ fontWeight: 600 }}>{op.full_name}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{op.email}</div>
      </td>
      {showCampaign && <td style={tdStyle}>{op.campaign_name}</td>}
      <td style={{ ...tdStyle, textAlign: "right" }}>{op.hablados}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{op.respondieron}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>{op.archivados}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <span style={{
          fontWeight: 700,
          fontSize: 15,
          color: totalWorked > 0 ? "var(--goberna-blue-600)" : "var(--color-text-tertiary)",
        }}>
          {totalWorked}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        {op.claimed_now > 0 ? (
          <span style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 12,
            background: "#fef3c7",
            color: "#92400e",
            fontSize: 12,
            fontWeight: 600,
          }}>
            {op.claimed_now} activo{op.claimed_now > 1 ? "s" : ""}
          </span>
        ) : (
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>-</span>
        )}
      </td>
    </tr>
  );
}

// ── Table styles ────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--color-text-tertiary)",
  borderBottom: "2px solid var(--color-border)",
  textAlign: "left",
  fontFamily: FONT,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 12px",
  fontSize: 13,
  color: "var(--color-text-primary)",
  borderBottom: "1px solid var(--color-border)",
  fontFamily: FONT,
};

const tableWrapStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--color-border)",
  boxShadow: "var(--shadow-sm)",
  overflow: "auto",
};

// ── Time metrics section ────────────────────────────────────────────

function formatMins(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v < 1) return "<1 min";
  if (v < 60) return `${Math.round(v)} min`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TimeMetricsSection({ tm }: { tm: CmsTimeMetrics }) {
  const hasData = tm.total_with_hablado > 0 || tm.total_with_respondieron > 0;
  if (!hasData) return null;

  return (
    <>
      <SectionHeader title="Tiempos de Gestion" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 8,
        }}
      >
        {/* WSP → Hablado */}
        <div style={timeCardStyle}>
          <div style={timeCardHeader}>
            <span style={timeCardIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <title>WSP a Hablado</title>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span style={timeCardLabel}>WSP → Hablado</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={timeCardValue}>{formatMins(tm.avg_claim_to_hablado_mins)}</div>
              <div style={timeCardSub}>promedio</div>
            </div>
            <div>
              <div style={{ ...timeCardValue, color: "var(--color-text-secondary)" }}>
                {formatMins(tm.median_claim_to_hablado_mins)}
              </div>
              <div style={timeCardSub}>mediana</div>
            </div>
          </div>
          <div style={timeCardFooter}>{tm.total_with_hablado} contacto{tm.total_with_hablado !== 1 ? "s" : ""}</div>
        </div>

        {/* Hablado → Contestó */}
        <div style={timeCardStyle}>
          <div style={timeCardHeader}>
            <span style={timeCardIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <title>Hablado a Contesto</title>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span style={timeCardLabel}>Hablado → Contestó</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={{ ...timeCardValue, color: "#7c3aed" }}>
                {formatMins(tm.avg_hablado_to_respondieron_mins)}
              </div>
              <div style={timeCardSub}>promedio</div>
            </div>
            <div>
              <div style={{ ...timeCardValue, color: "var(--color-text-secondary)" }}>
                {formatMins(tm.median_hablado_to_respondieron_mins)}
              </div>
              <div style={timeCardSub}>mediana</div>
            </div>
          </div>
          <div style={timeCardFooter}>{tm.total_with_respondieron} contacto{tm.total_with_respondieron !== 1 ? "s" : ""}</div>
        </div>
      </div>
    </>
  );
}

const timeCardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-lg)",
  padding: 20,
  border: "1px solid var(--color-border)",
  boxShadow: "var(--shadow-sm)",
  fontFamily: FONT,
};

const timeCardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 14,
};

const timeCardIcon: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "#f0fdf4",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const timeCardLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text-primary)",
};

const timeCardValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "#16a34a",
  lineHeight: 1.1,
};

const timeCardSub: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  marginTop: 2,
};

const timeCardFooter: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid var(--color-border)",
};

// ── Main Page ───────────────────────────────────────────────────────

export default function CmsMetricsPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<CmsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMultiCampaign = (metrics?.campaigns.length ?? 0) > 1;

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCmsMetrics();
      if (!res.ok) {
        setError(res.error ?? "Error cargando metricas");
        return;
      }
      setMetrics(res.metrics ?? null);
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // ── Loading / Error states ──────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", fontFamily: FONT }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: "3px solid var(--color-border)", borderTopColor: "var(--goberna-blue-600)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>Cargando metricas...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: FONT }}>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius-lg)", padding: 20, color: "#dc2626", fontSize: 14 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const g = metrics.global_totals;
  const contacted = g.hablados + g.respondieron;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto", fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            Metricas CMS
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "4px 0 0" }}>
            {isMultiCampaign
              ? `${metrics.campaigns.length} campanas`
              : metrics.campaigns[0]?.campaign_name ?? "Sin campanas"}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchMetrics}
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <KpiCard label="Total Contactos" value={String(g.total)} tone="blue" />
        <KpiCard
          label="Contactados"
          value={String(contacted)}
          subtitle={`${(g.contact_rate * 100).toFixed(0)}% del total`}
          tone="green"
        />
        <KpiCard
          label="Respondieron"
          value={String(g.respondieron)}
          subtitle={`${(g.response_rate * 100).toFixed(0)}% de contactados`}
          tone="purple"
        />
        <KpiCard label="Pendientes" value={String(g.nuevos)} tone="red" />
        <KpiCard
          label="En proceso"
          value={String(g.claimed)}
          subtitle="Siendo contactados ahora"
          tone="gold"
        />
        <KpiCard label="Archivados" value={String(g.archivados)} tone="gray" />
      </div>

      {/* Time Metrics */}
      {metrics.time_metrics && <TimeMetricsSection tm={metrics.time_metrics} />}

      {/* Per-campaign table (only shown when multi-campaign or always for context) */}
      <SectionHeader title="Rendimiento por Campana" />
      <div style={tableWrapStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Campana</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Pendientes</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hablados</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Respondieron</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Archivados</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Tasa Contacto</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Tasa Respuesta</th>
            </tr>
          </thead>
          <tbody>
            {metrics.campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-tertiary)", padding: 32 }}>
                  Sin datos de campanas
                </td>
              </tr>
            ) : (
              metrics.campaigns.map((c) => <CampaignRow key={c.campaign_id} c={c} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Per-operator table */}
      <SectionHeader title="Rendimiento por Operadora" />
      <div style={tableWrapStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Operadora</th>
              {isMultiCampaign && <th style={thStyle}>Campana</th>}
              <th style={{ ...thStyle, textAlign: "right" }}>Hablados</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Respondieron</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Archivados</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total Gestionados</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {metrics.operators.length === 0 ? (
              <tr>
                <td colSpan={isMultiCampaign ? 7 : 6} style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-tertiary)", padding: 32 }}>
                  Sin operadoras activas
                </td>
              </tr>
            ) : (
              metrics.operators.map((op) => (
                <OperatorRow key={`${op.user_id}-${op.campaign_id}`} op={op} showCampaign={isMultiCampaign} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer spacer */}
      <div style={{ height: 48 }} />
    </div>
  );
}
