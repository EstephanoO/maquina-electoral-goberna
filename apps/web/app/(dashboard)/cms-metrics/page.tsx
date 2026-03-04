"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getCmsMetrics, type CmsMetrics } from "@/lib/services/cms";
import { MetricsBody, FONT } from "./_components";

/* ═══════════════════════════════════════════════════════════════════
   GOBERNA — CMS Metrics: Digital Agents Performance Dashboard
   Standalone route: /cms-metrics (scoped by activeCampaignId)
   ═══════════════════════════════════════════════════════════════════ */

export default function CmsMetricsPage() {
  const { activeCampaignId, campaigns } = useAuth();
  const [metrics, setMetrics] = useState<CmsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);

  const fetchMetrics = useCallback(async () => {
    if (!activeCampaignId) return;
    if (!metrics) setLoading(true);
    setError(null);
    try {
      const res = await getCmsMetrics(activeCampaignId);
      if (!res.ok) { setError(res.error ?? "Error cargando metricas"); return; }
      setMetrics(res.metrics ?? null);
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [activeCampaignId, metrics]);

  useEffect(() => {
    fetchMetrics();
    refreshRef.current = setInterval(fetchMetrics, 30_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchMetrics]);

  if (!activeCampaignId) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: FONT, color: "var(--color-text-tertiary)" }}>
        Selecciona una campana para ver las metricas.
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
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, color: "#dc2626", fontSize: 14 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto", fontFamily: FONT }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text-primary)", margin: 0, letterSpacing: "0.02em" }}>
            METRICAS DIGITAL
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "4px 0 0" }}>
            {activeCampaign?.name ?? "Campana"} &middot; {metrics.global_totals.total} contactos
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/cms"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", fontSize: 12, fontWeight: 600, fontFamily: FONT,
              color: "var(--goberna-blue-900)", background: "var(--goberna-blue-50)",
              border: "1px solid var(--goberna-blue-200, #bfdbfe)", borderRadius: 8,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Ver Contactos
          </Link>
          <button
            type="button"
            onClick={fetchMetrics}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: "1px solid var(--color-border)", background: "var(--color-surface)",
              color: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: FONT,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      <MetricsBody metrics={metrics} />
    </div>
  );
}
