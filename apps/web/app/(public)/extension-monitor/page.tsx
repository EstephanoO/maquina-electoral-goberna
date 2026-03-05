"use client";

/**
 * GOBERNA — Extension Monitor (Public)
 * Muestra actividad WhatsApp Web por celular físico y operadora.
 * Acceso: público (no requiere auth) — proteger después de testing.
 */

import { useEffect, useState, useCallback } from "react";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
  type ExtensionMonitorOperator,
  type ExtensionMonitorTotals,
} from "@/lib/services/cms";

// ── Helpers ──────────────────────────────────────────────────────────

function formatRelative(isoStr: string | null): string {
  if (!isoStr) return "—";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.floor(hrs / 24)} d`;
}

function getFirstName(fullName: string, email: string): string {
  return fullName.split(" ")[0] || email.split("@")[0] || "—";
}

function getInitial(fullName: string, email: string): string {
  return (fullName.charAt(0) || email.charAt(0) || "?").toUpperCase();
}

function formatNumber(num: string): string {
  // "51987654321" → "+51 987 654 321"
  if (num === "desconocido") return "Desconocido";
  if (num.length >= 11) {
    const cc = num.slice(0, 2);
    const rest = num.slice(2);
    return `+${cc} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`.trim();
  }
  return `+${num}`;
}

// ── Sub-components ───────────────────────────────────────────────────

function GlobalStatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div style={{
      background: "#1f2c34",
      border: "1px solid #2a3942",
      borderRadius: 10,
      padding: "18px 22px",
      flex: "1 1 130px",
      minWidth: 130,
    }}>
      <div style={{ fontSize: 34, fontWeight: 800, color: "#00a884", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#8696a0", marginTop: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
    </div>
  );
}

function OperatorRow({ op, maxSent }: { op: ExtensionMonitorOperator; maxSent: number }) {
  const firstName = getFirstName(op.full_name, op.email);
  const initial = getInitial(op.full_name, op.email);
  const barPct = maxSent > 0 ? (op.wa_sent / maxSent) * 100 : 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 0",
      borderBottom: "1px solid #1a2730",
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: op.wa_sent > 0 ? "#003d2e" : "#1a2730",
        color: op.wa_sent > 0 ? "#00a884" : "#3a4a52",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800,
      }}>
        {initial}
      </div>

      {/* Name + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#e9edef", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {firstName}
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "#1a2730", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${barPct}%`,
            background: "#00a884", borderRadius: 2,
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* Count */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#00a884" }}>{op.wa_sent}</span>
        <span style={{ fontSize: 10, color: "#5c6b73", marginLeft: 3 }}>env</span>
      </div>
    </div>
  );
}

function PhoneCard({ phone }: { phone: ExtensionMonitorPhone }) {
  const displayName = phone.alias ?? formatNumber(phone.own_number);
  const maxOpSent = phone.operators.reduce((m, op) => Math.max(m, op.wa_sent), 0);
  const isActive = phone.wa_sent > 0;

  return (
    <div style={{
      background: "#1f2c34",
      border: `1px solid ${isActive ? "#2a5c4a" : "#2a3942"}`,
      borderRadius: 12,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 0,
      minWidth: 0,
    }}>
      {/* Card header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#e9edef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {displayName}
          </div>
          {isActive && (
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#00a884", flexShrink: 0,
              boxShadow: "0 0 6px #00a884",
            }} />
          )}
        </div>
        {phone.alias && (
          <div style={{ fontSize: 11, color: "#5c6b73", marginTop: 2 }}>
            {formatNumber(phone.own_number)}
          </div>
        )}
      </div>

      {/* Metrics row */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 12,
        paddingBottom: 12, borderBottom: "1px solid #2a3942",
      }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#00a884", lineHeight: 1 }}>{phone.wa_sent}</div>
          <div style={{ fontSize: 9, color: "#8696a0", fontWeight: 600, textTransform: "uppercase", marginTop: 3 }}>enviados</div>
        </div>
        <div style={{ width: 1, background: "#2a3942" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#7c3aed", lineHeight: 1 }}>{phone.unique_contacts}</div>
          <div style={{ fontSize: 9, color: "#8696a0", fontWeight: 600, textTransform: "uppercase", marginTop: 3 }}>contactos</div>
        </div>
        <div style={{ width: 1, background: "#2a3942" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#e9edef", lineHeight: 1 }}>
            {phone.operators.filter(o => o.wa_sent > 0).length}
          </div>
          <div style={{ fontSize: 9, color: "#8696a0", fontWeight: 600, textTransform: "uppercase", marginTop: 3 }}>operadoras</div>
        </div>
      </div>

      {/* Operators */}
      <div>
        {phone.operators.length === 0 ? (
          <div style={{ fontSize: 11, color: "#3a4a52", textAlign: "center", padding: "8px 0" }}>
            Sin actividad
          </div>
        ) : (
          phone.operators
            .filter(op => op.wa_sent > 0)
            .sort((a, b) => b.wa_sent - a.wa_sent)
            .map(op => (
              <OperatorRow key={op.operator_id} op={op} maxSent={maxOpSent} />
            ))
        )}
        {phone.last_event_at && (
          <div style={{ fontSize: 10, color: "#3a4a52", marginTop: 8, textAlign: "right" }}>
            Último: {formatRelative(phone.last_event_at)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "eece49d5-a315-4764-83f9-681cabae5c51";

export default function ExtensionMonitorPage() {
  const [phones, setPhones] = useState<ExtensionMonitorPhone[]>([]);
  const [totals, setTotals] = useState<ExtensionMonitorTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getExtensionMonitor(CAMPAIGN_ID);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Error desconocido");
      return;
    }
    setPhones(result.phones ?? []);
    setTotals(result.totals ?? null);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111b21",
      color: "#e9edef",
      fontFamily: font,
      padding: "28px 20px 48px",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 24, flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>
              📡 Monitor de Extensión
            </div>
            <div style={{ fontSize: 12, color: "#8696a0", marginTop: 2 }}>
              Actividad WhatsApp Web por celular — César Vásquez
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
              onClick={load}
              disabled={loading}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "1px solid #2a3942",
                background: "none", color: loading ? "#3a4a52" : "#8696a0",
                fontSize: 12, cursor: loading ? "default" : "pointer", fontWeight: 600,
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
            borderRadius: 8, padding: "12px 16px", marginBottom: 20,
            fontSize: 13, color: "#ef5350",
          }}>
            {error}
          </div>
        )}

        {/* Global totals */}
        {totals && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <GlobalStatCard label="Total enviados" value={totals.wa_sent} />
            <GlobalStatCard label="Contactos únicos" value={totals.unique_contacts} />
            <GlobalStatCard label="Operadoras activas" value={totals.active_operators} />
            <GlobalStatCard label="Celulares activos" value={phones.filter(p => p.wa_sent > 0).length} />
          </div>
        )}

        {/* Loading skeleton */}
        {loading && phones.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#3a4a52", fontSize: 14 }}>
            Cargando datos...
          </div>
        )}

        {/* No data */}
        {!loading && phones.length === 0 && !error && (
          <div style={{
            background: "#1f2c34", border: "1px solid #2a3942",
            borderRadius: 12, padding: "40px 24px", textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 14, color: "#8696a0" }}>Sin actividad registrada todavía.</div>
            <div style={{ fontSize: 12, color: "#3a4a52", marginTop: 6 }}>
              La extensión de Chrome enviará datos cuando las operadoras comiencen a trabajar.
            </div>
          </div>
        )}

        {/* Phone cards grid */}
        {phones.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}>
            {phones.map((phone) => (
              <PhoneCard key={phone.own_number} phone={phone} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 28, fontSize: 11, color: "#2a3942", textAlign: "center" }}>
          Actualización automática cada 30 s · Goberna
        </div>
      </div>
    </div>
  );
}
