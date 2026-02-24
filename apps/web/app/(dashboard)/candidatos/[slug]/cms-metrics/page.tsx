"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getCmsMetrics,
  type CmsMetrics,
  type CmsMetricsOperator,
  type CmsTimeMetrics,
} from "@/lib/services/cms";

/* ═══════════════════════════════════════════════════════════════════
   GOBERNA — CMS Metrics: Digital Agents Performance
   Candidato-scoped: /candidatos/[slug]/cms-metrics
   ═══════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-montserrat), system-ui, sans-serif";

// ── Operators to exclude from metrics display ───────────────────────
const HIDDEN_EMAILS = new Set(["cesarvasquez@goberna.pe"]);
const HIDDEN_NAMES = new Set(["Cesar Vasquez"]);

function isHiddenOperator(op: CmsMetricsOperator): boolean {
  return HIDDEN_EMAILS.has(op.email.toLowerCase()) || HIDDEN_NAMES.has(op.full_name);
}

// ── Helpers ─────────────────────────────────────────────────────────

function pct(a: number, b: number): string {
  if (b <= 0) return "0";
  return ((a / b) * 100).toFixed(0);
}

function formatMins(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v < 1) return "<1m";
  if (v < 60) return `${Math.round(v)}m`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Funnel Step ─────────────────────────────────────────────────────

function FunnelStep({
  label, count, total, color, icon, isLast,
}: {
  label: string; count: number; total: number; color: string; icon: React.ReactNode; isLast?: boolean;
}) {
  const percentage = pct(count, total);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, flex: 1, minWidth: 0 }}>
      <div style={{ flex: 1, background: "var(--color-surface)", borderRadius: 12, padding: "16px 20px", border: `1px solid ${color}20`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${total > 0 ? (count / total) * 100 : 0}%`, background: `${color}08`, transition: "width 0.5s ease" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color, display: "flex" }}>{icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{count}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: `${color}99` }}>{percentage}%</span>
          </div>
        </div>
      </div>
      {!isLast && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="2" style={{ flexShrink: 0, margin: "0 -2px" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </div>
  );
}

// ── Operator Card ───────────────────────────────────────────────────

function OperatorCard({ op, maxWorked }: { op: CmsMetricsOperator; maxWorked: number }) {
  const totalWorked = op.hablados + op.respondieron + op.archivados;
  const segments = [
    { count: op.respondieron, color: "#7c3aed", label: "Contestaron" },
    { count: op.hablados, color: "#16a34a", label: "Hablados" },
    { count: op.archivados, color: "#9ca3af", label: "Archivados" },
  ];
  const firstName = op.full_name.split(" ")[0] || op.email.split("@")[0] || "—";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <div style={{ background: "var(--color-surface)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--color-border)", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: totalWorked > 0 ? "var(--goberna-blue-100, #dbeafe)" : "var(--color-border)", color: totalWorked > 0 ? "var(--goberna-blue-600, #2563eb)" : "var(--color-text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.full_name || firstName}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.email}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalWorked > 0 ? "var(--goberna-blue-600, #2563eb)" : "var(--color-text-tertiary)", lineHeight: 1 }}>{totalWorked}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 600 }}>gestionados</div>
        </div>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--color-border)", overflow: "hidden", display: "flex", marginBottom: 10 }}>
        {segments.map((s) => {
          const segPct = maxWorked > 0 ? (s.count / maxWorked) * 100 : 0;
          return segPct > 0 ? <div key={s.label} style={{ width: `${segPct}%`, height: "100%", background: s.color, transition: "width 0.4s ease" }} title={`${s.label}: ${s.count}`} /> : null;
        })}
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Clock Icon ──────────────────────────────────────────────────────

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── Time Card ───────────────────────────────────────────────────────

function TimeCard({ label, avg, median, count, color, icon }: { label: string; avg: number | null; median: number | null; count: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: "var(--color-surface)", borderRadius: 12, padding: "18px 20px", border: "1px solid var(--color-border)", fontFamily: FONT, flex: "1 1 260px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: `${color}12`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: 32, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{formatMins(avg)}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 3, fontWeight: 600 }}>promedio</div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--color-text-secondary)", lineHeight: 1 }}>{formatMins(median)}</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 3, fontWeight: 600 }}>mediana</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>{count} contacto{count !== 1 ? "s" : ""}</div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function CmsMetricsPage() {
  const { campaigns } = useAuth();
  const params = useParams();
  const slug = params.slug as string;

  const campaign = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? null;

  const [metrics, setMetrics] = useState<CmsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!campaignId) return;
    setLoading((prev) => !metrics ? true : prev);
    setError(null);
    try {
      const res = await getCmsMetrics(campaignId);
      if (!res.ok) { setError(res.error ?? "Error cargando metricas"); return; }
      setMetrics(res.metrics ?? null);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [campaignId, metrics]);

  useEffect(() => {
    fetchMetrics();
    refreshRef.current = setInterval(fetchMetrics, 30_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchMetrics]);

  if (!campaignId) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", fontFamily: FONT }}>
        <div style={{ textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 14 }}>
          Campana no encontrada para &ldquo;{slug}&rdquo;
        </div>
      </div>
    );
  }

  if (loading && !metrics) {
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
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, color: "#dc2626", fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  if (!metrics) return null;

  const g = metrics.global_totals;
  const contacted = g.hablados + g.respondieron;
  const tm = metrics.time_metrics;

  const visibleOperators = metrics.operators.filter((op) => !isHiddenOperator(op));
  const maxWorked = Math.max(1, ...visibleOperators.map((op) => op.hablados + op.respondieron + op.archivados));
  const sortedOperators = [...visibleOperators].sort((a, b) => (b.hablados + b.respondieron + b.archivados) - (a.hablados + a.respondieron + a.archivados));

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto", fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text-primary)", margin: 0, letterSpacing: "0.02em" }}>METRICAS DIGITAL</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "4px 0 0" }}>{campaign?.name ?? slug} &middot; {g.total} contactos</p>
        </div>
        <button type="button" onClick={fetchMetrics} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          Actualizar
        </button>
      </div>

      {/* Funnel */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, alignItems: "stretch" }}>
        <FunnelStep label="Pendientes" count={g.nuevos} total={g.total} color="#ef4444" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>} />
        <FunnelStep label="Hablados" count={g.hablados} total={g.total} color="#16a34a" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" /></svg>} />
        <FunnelStep label="Contestaron" count={g.respondieron} total={g.total} color="#7c3aed" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>} />
        <FunnelStep label="Archivados" count={g.archivados} total={g.total} color="#9ca3af" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /></svg>} isLast />
      </div>

      {/* Conversion Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", background: "#f0fdf4", borderRadius: 12, padding: "16px 20px", border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Tasa de Contacto</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#16a34a", lineHeight: 1 }}>{pct(contacted, g.total)}%</div>
          <div style={{ fontSize: 11, color: "#166534", marginTop: 4 }}>{contacted} de {g.total} contactados</div>
        </div>
        <div style={{ flex: "1 1 200px", background: "#f5f3ff", borderRadius: 12, padding: "16px 20px", border: "1px solid #ddd6fe" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#5b21b6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Tasa de Respuesta</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#7c3aed", lineHeight: 1 }}>{pct(g.respondieron, contacted)}%</div>
          <div style={{ fontSize: 11, color: "#5b21b6", marginTop: 4 }}>{g.respondieron} de {contacted} respondieron</div>
        </div>
        <div style={{ flex: "1 1 200px", background: "var(--goberna-blue-50, #eff6ff)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--goberna-blue-200, #bfdbfe)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--goberna-blue-900)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Eficiencia Global</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--goberna-blue-600, #2563eb)", lineHeight: 1 }}>{pct(g.respondieron, g.total)}%</div>
          <div style={{ fontSize: 11, color: "var(--goberna-blue-900)", marginTop: 4 }}>{g.respondieron} respuestas de {g.total} total</div>
        </div>
      </div>

      {/* Time Metrics */}
      {tm && (tm.total_with_hablado > 0 || tm.total_with_respondieron > 0) && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 14px", letterSpacing: "0.02em" }}>TIEMPOS DE GESTION</h2>
          <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
            <TimeCard label="WSP → Hablado" avg={tm.avg_claim_to_hablado_mins} median={tm.median_claim_to_hablado_mins} count={tm.total_with_hablado} color="#16a34a" icon={<ClockIcon color="#16a34a" />} />
            <TimeCard label="Hablado → Contesto" avg={tm.avg_hablado_to_respondieron_mins} median={tm.median_hablado_to_respondieron_mins} count={tm.total_with_respondieron} color="#7c3aed" icon={<ClockIcon color="#7c3aed" />} />
          </div>
        </>
      )}

      {/* Operators */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--color-text-primary)", margin: "0 0 14px", letterSpacing: "0.02em" }}>
        AGENTES DIGITALES
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", marginLeft: 8 }}>{sortedOperators.length} activo{sortedOperators.length !== 1 ? "s" : ""}</span>
      </h2>
      {sortedOperators.length === 0 ? (
        <div style={{ background: "var(--color-surface)", borderRadius: 12, padding: 32, textAlign: "center", border: "1px solid var(--color-border)", color: "var(--color-text-tertiary)", fontSize: 14 }}>Sin agentes digitales activos</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {sortedOperators.map((op) => (
            <OperatorCard key={`${op.user_id}-${op.campaign_id}`} op={op} maxWorked={maxWorked} />
          ))}
        </div>
      )}
      <div style={{ height: 48 }} />
    </div>
  );
}
