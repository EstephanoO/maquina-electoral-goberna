"use client";

import { useEffect, useState, useCallback } from "react";
import { getExtensionMonitor, type ExtensionMonitorOperator, type ExtensionMonitorTotals } from "@/lib/services/cms";

// ── Helpers ──────────────────────────────────────────────────────────

function formatRelative(isoStr: string | null): string {
  if (!isoStr) return "—";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "hace menos de 1 min";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function getFirstName(fullName: string, email: string): string {
  return fullName.split(" ")[0] || email.split("@")[0] || "—";
}

function getInitial(fullName: string, email: string): string {
  return (fullName.charAt(0) || email.charAt(0) || "?").toUpperCase();
}

// ── Sub-components ───────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{
      background: "#1f2c34",
      border: "1px solid #2a3942",
      borderRadius: 12,
      padding: "20px 24px",
      minWidth: 140,
      flex: "1 1 140px",
    }}>
      <div style={{ fontSize: 36, fontWeight: 800, color: "#00a884", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8696a0", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#3a4a52", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function OperatorRow({ op, maxSent }: { op: ExtensionMonitorOperator; maxSent: number }) {
  const initial = getInitial(op.full_name, op.email);
  const firstName = getFirstName(op.full_name, op.email);
  const barPct = maxSent > 0 ? (op.wa_sent / maxSent) * 100 : 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 0",
      borderBottom: "1px solid #2a3942",
    }}>
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        background: op.wa_sent > 0 ? "#003d2e" : "#2a3942",
        color: op.wa_sent > 0 ? "#00a884" : "#5c6b73",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 800, flexShrink: 0,
      }}>
        {initial}
      </div>

      {/* Name + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#e9edef" }}>{firstName}</span>
            <span style={{ fontSize: 11, color: "#8696a0", marginLeft: 6 }}>{op.email}</span>
          </div>
          <span style={{ fontSize: 11, color: "#8696a0", flexShrink: 0, marginLeft: 8 }}>
            {formatRelative(op.last_event_at)}
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ height: 6, borderRadius: 3, background: "#2a3942", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${barPct}%`,
            background: "#00a884",
            borderRadius: 3,
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "flex", gap: 20, flexShrink: 0, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#00a884", lineHeight: 1 }}>{op.wa_sent}</div>
          <div style={{ fontSize: 10, color: "#8696a0", fontWeight: 600, textTransform: "uppercase" }}>enviados</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#7c3aed", lineHeight: 1 }}>{op.unique_phones}</div>
          <div style={{ fontSize: 10, color: "#8696a0", fontWeight: 600, textTransform: "uppercase" }}>contactos</div>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function ExtensionMonitorPage() {
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [operators, setOperators] = useState<ExtensionMonitorOperator[]>([]);
  const [totals, setTotals] = useState<ExtensionMonitorTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Read campaign_id from ?c= query param (client-side — this is a client component)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c) setCampaignId(c);
  }, []);

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    const result = await getExtensionMonitor(cid);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Error desconocido");
      return;
    }
    setOperators(result.operators ?? []);
    setTotals(result.totals ?? null);
    setLastRefresh(new Date());
  }, []);

  // Load on mount when campaignId is available
  useEffect(() => {
    if (campaignId) load(campaignId);
  }, [campaignId, load]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!campaignId) return;
    const interval = setInterval(() => load(campaignId), 30_000);
    return () => clearInterval(interval);
  }, [campaignId, load]);

  const maxSent = operators.reduce((m, op) => Math.max(m, op.wa_sent), 0);

  // ── No campaign_id ──
  if (!campaignId) {
    return (
      <div style={{
        minHeight: "100vh", background: "#111b21", color: "#e9edef",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 32, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>📡</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Monitor de Extensión</div>
        <div style={{ fontSize: 13, color: "#8696a0", textAlign: "center", maxWidth: 380, lineHeight: 1.6 }}>
          Abrí esta página con el parámetro <code style={{ background: "#1f2c34", padding: "2px 6px", borderRadius: 4 }}>?c=&lt;campaign_id&gt;</code><br />
          Ejemplo: <code style={{ background: "#1f2c34", padding: "2px 6px", borderRadius: 4 }}>/extension-monitor?c=uuid-de-tu-campana</code>
        </div>
      </div>
    );
  }

  // ── Main layout ──
  return (
    <div style={{
      minHeight: "100vh",
      background: "#111b21",
      color: "#e9edef",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "32px 24px",
      maxWidth: 720,
      margin: "0 auto",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.3px" }}>
            📡 Monitor de Extensión
          </div>
          <div style={{ fontSize: 12, color: "#8696a0", marginTop: 3 }}>
            Actividad WhatsApp Web por operadora
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: "#3a4a52" }}>
              Act. {lastRefresh.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(campaignId)}
            disabled={loading}
            style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid #2a3942",
              background: "none", color: loading ? "#3a4a52" : "#8696a0",
              fontSize: 12, cursor: loading ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Cargando..." : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "#2d0d0d", border: "1px solid #7f1d1d",
          borderRadius: 8, padding: "12px 16px", marginBottom: 24,
          fontSize: 13, color: "#ef5350",
        }}>
          {error}
        </div>
      )}

      {/* Global totals */}
      {totals && (
        <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          <StatCard label="Total enviados" value={totals.wa_sent} sub="mensajes WA" />
          <StatCard label="Contactos únicos" value={totals.unique_phones} sub="teléfonos distintos" />
          <StatCard label="Operadoras activas" value={operators.filter(o => o.wa_sent > 0).length} sub={`de ${operators.length} total`} />
        </div>
      )}

      {/* Operators list */}
      <div style={{
        background: "#1f2c34",
        border: "1px solid #2a3942",
        borderRadius: 12,
        padding: "0 20px",
      }}>
        <div style={{
          padding: "14px 0",
          borderBottom: "1px solid #2a3942",
          fontSize: 11,
          color: "#8696a0",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>Operadora</span>
          <span style={{ marginRight: 4 }}>Enviados · Contactos</span>
        </div>

        {loading && operators.length === 0 && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#3a4a52", fontSize: 13 }}>
            Cargando datos...
          </div>
        )}

        {!loading && operators.length === 0 && !error && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#3a4a52", fontSize: 13 }}>
            Sin actividad registrada todavía para esta campaña.
          </div>
        )}

        {operators.map((op) => (
          <OperatorRow key={op.operator_id} op={op} maxSent={maxSent} />
        ))}

        {/* Last row has no bottom border */}
        {operators.length > 0 && (
          <div style={{ height: 1 }} />
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 11, color: "#3a4a52", textAlign: "center" }}>
        Actualización automática cada 30 segundos · campaign_id: {campaignId}
      </div>
    </div>
  );
}
