"use client";

/**
 * GOBERNA — Extension Monitor (Public)
 * Muestra actividad WhatsApp Web por celular físico y operadora.
 * Cards con forma de smartphone. Siempre muestra los 5 celulares registrados.
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
  if (num === "desconocido") return "Desconocido";
  if (num.length >= 11) {
    const cc = num.slice(0, 2);
    const rest = num.slice(2);
    return `+${cc} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`.trim();
  }
  return `+${num}`;
}

// ── Sub-components ───────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "10px 4px 8px",
      background: "rgba(0,0,0,0.2)",
      borderRadius: 10,
    }}>
      <span style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-0.5px" }}>
        {value}
      </span>
      <span style={{ fontSize: 8, color: "#8696a0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 4 }}>
        {label}
      </span>
    </div>
  );
}

function OperatorRow({ op, maxSent }: { op: ExtensionMonitorOperator; maxSent: number }) {
  const firstName = getFirstName(op.full_name, op.email);
  const initial = getInitial(op.full_name, op.email);
  const barPct = maxSent > 0 ? (op.wa_sent / maxSent) * 100 : 0;
  const isActive = op.wa_sent > 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 7,
      padding: "6px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        background: isActive ? "rgba(0,168,132,0.15)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${isActive ? "rgba(0,168,132,0.4)" : "transparent"}`,
        color: isActive ? "#00a884" : "#3a4a52",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 900,
      }}>
        {initial}
      </div>

      {/* Name + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: isActive ? "#d1d7db" : "#4a5a62",
          marginBottom: 3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {firstName}
        </div>
        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${barPct}%`,
            background: "linear-gradient(90deg, #00a884, #00c49a)",
            borderRadius: 2, transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>
      </div>

      {/* Count */}
      <span style={{
        flexShrink: 0,
        fontSize: 13, fontWeight: 900,
        color: isActive ? "#00a884" : "#3a4a52",
        minWidth: 20, textAlign: "right",
      }}>
        {op.wa_sent}
      </span>
    </div>
  );
}

function PhoneCard({ phone }: { phone: ExtensionMonitorPhone }) {
  const displayName = phone.alias ?? formatNumber(phone.own_number);
  const maxOpSent = phone.operators.reduce((m, op) => Math.max(m, op.wa_sent), 0);
  const isActive = phone.wa_sent > 0;
  const activeOps = phone.operators.filter(o => o.wa_sent > 0);

  return (
    /* Outer "device" frame */
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      /* no fixed width — flex grid controls it */
    }}>
      {/* Phone body */}
      <div style={{
        width: "100%",
        aspectRatio: "9 / 17",
        background: isActive
          ? "linear-gradient(160deg, #1a2e28 0%, #162722 50%, #111f1c 100%)"
          : "linear-gradient(160deg, #1a2530 0%, #141e27 50%, #101820 100%)",
        border: `1.5px solid ${isActive ? "rgba(0,168,132,0.35)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 28,
        boxShadow: isActive
          ? "0 0 0 1px rgba(0,168,132,0.1), 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(0,168,132,0.08)"
          : "0 4px 20px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        transition: "box-shadow 0.3s ease, border-color 0.3s ease",
      }}>

        {/* Top notch bar */}
        <div style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: "rgba(0,0,0,0.25)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          position: "relative",
        }}>
          {/* Notch pill */}
          <div style={{
            width: 48, height: 8, borderRadius: 4,
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.05)",
          }} />

          {/* Live dot */}
          {isActive && (
            <div style={{
              position: "absolute",
              right: 12,
              width: 7, height: 7, borderRadius: "50%",
              background: "#00a884",
              boxShadow: "0 0 8px rgba(0,168,132,0.8)",
              animation: "pulse 2s ease-in-out infinite",
            }} />
          )}
        </div>

        {/* Screen content */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "10px 10px 8px",
          gap: 8,
          overflow: "hidden",
        }}>
          {/* Header: alias + number */}
          <div>
            <div style={{
              fontSize: 14, fontWeight: 900, color: "#e9edef",
              letterSpacing: "-0.3px", lineHeight: 1.2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {displayName}
            </div>
            {phone.alias && (
              <div style={{
                fontSize: 9, color: "#3d5060", fontWeight: 600, marginTop: 2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {formatNumber(phone.own_number)}
              </div>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 5 }}>
            <StatPill value={phone.wa_sent} label="env" color={isActive ? "#00a884" : "#3a4a52"} />
            <StatPill value={phone.unique_contacts} label="ctcs" color={isActive ? "#7c9cf5" : "#3a4a52"} />
            <StatPill value={activeOps.length} label="ops" color={isActive ? "#f0a030" : "#3a4a52"} />
          </div>

          {/* Separator */}
          <div style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
          }} />

          {/* Operator list */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {phone.operators.length === 0 ? (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <div style={{ fontSize: 22, opacity: 0.15 }}>📱</div>
                <div style={{ fontSize: 10, color: "#2a3942", textAlign: "center", lineHeight: 1.4 }}>
                  Sin actividad
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {activeOps
                  .sort((a, b) => b.wa_sent - a.wa_sent)
                  .slice(0, 6)
                  .map((op) => (
                    <OperatorRow key={op.operator_id} op={op} maxSent={maxOpSent} />
                  ))}
              </div>
            )}
          </div>

          {/* Footer: last event */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isActive ? "space-between" : "center",
            marginTop: "auto",
            paddingTop: 4,
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}>
            {isActive ? (
              <>
                <span style={{ fontSize: 9, color: "#3d5060" }}>Último:</span>
                <span style={{ fontSize: 9, color: "#5c7080", fontWeight: 600 }}>
                  {formatRelative(phone.last_event_at)}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 9, color: "#2a3942" }}>Esperando actividad...</span>
            )}
          </div>
        </div>

        {/* Bottom home bar */}
        <div style={{
          height: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.25)",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: "rgba(255,255,255,0.12)",
          }} />
        </div>
      </div>

      {/* Alias label below phone */}
      <div style={{
        marginTop: 10, fontSize: 11, fontWeight: 700,
        color: isActive ? "#d1d7db" : "#3a4a52",
        textAlign: "center", letterSpacing: "0.2px",
      }}>
        {displayName}
      </div>
    </div>
  );
}

function GlobalStatCard({ label, value, accent = "#00a884" }: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #1f2c34 0%, #1a2530 100%)",
      border: "1px solid #2a3942",
      borderRadius: 12,
      padding: "16px 20px",
      flex: "1 1 120px",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 30, fontWeight: 900, color: accent, lineHeight: 1, letterSpacing: "-1px" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#8696a0", marginTop: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>
        {label}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "eece49d5-a315-4764-83f9-681cabae5c51";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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

  return (
    <>
      {/* Keyframe for pulse animation — injected once */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 20% 0%, #0d1f1a 0%, #111b21 60%)",
        color: "#e9edef",
        fontFamily: FONT,
        padding: "28px 24px 64px",
      }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>

          {/* ── Header ── */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            marginBottom: 28, flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <div style={{
                fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px",
                background: "linear-gradient(90deg, #00a884, #00c49a)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                display: "inline-block",
              }}>
                Monitor de Extensión
              </div>
              <div style={{ fontSize: 12, color: "#5c7080", marginTop: 3, fontWeight: 500 }}>
                WhatsApp Web · Celulares César Vásquez
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {lastRefresh && (
                <span style={{
                  fontSize: 11, color: "#2a3942", fontVariantNumeric: "tabular-nums",
                }}>
                  {lastRefresh.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                type="button"
                onClick={load}
                disabled={loading}
                style={{
                  padding: "6px 14px", borderRadius: 8,
                  border: "1px solid #2a3942",
                  background: loading ? "transparent" : "rgba(0,168,132,0.08)",
                  color: loading ? "#2a3942" : "#00a884",
                  fontSize: 12, cursor: loading ? "default" : "pointer",
                  fontWeight: 700, transition: "all 0.2s",
                }}
              >
                {loading ? "Actualizando..." : "↻ Actualizar"}
              </button>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div style={{
              background: "rgba(239,83,80,0.08)", border: "1px solid rgba(239,83,80,0.3)",
              borderRadius: 10, padding: "12px 16px", marginBottom: 24,
              fontSize: 13, color: "#ef5350",
            }}>
              {error}
            </div>
          )}

          {/* ── Global totals ── */}
          {totals && (
            <div style={{ display: "flex", gap: 10, marginBottom: 32, flexWrap: "wrap" }}>
              <GlobalStatCard label="Total enviados" value={totals.wa_sent} accent="#00a884" />
              <GlobalStatCard label="Contactos únicos" value={totals.unique_contacts} accent="#7c9cf5" />
              <GlobalStatCard label="Operadoras activas" value={totals.active_operators} accent="#f0a030" />
              <GlobalStatCard label="Celulares activos" value={phones.filter(p => p.wa_sent > 0).length} accent="#e9edef" />
            </div>
          )}

          {/* ── Loading skeleton ── */}
          {loading && phones.length === 0 && (
            <div style={{ padding: "60px 0", textAlign: "center", color: "#2a3942", fontSize: 14 }}>
              Cargando datos...
            </div>
          )}

          {/* ── Phone cards grid ── */}
          {phones.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 16,
            }}>
              {phones.map((phone) => (
                <PhoneCard key={phone.own_number} phone={phone} />
              ))}
            </div>
          )}

          {/* ── Empty state (no wa_phones registered at all) ── */}
          {!loading && phones.length === 0 && !error && (
            <div style={{
              background: "rgba(31,44,52,0.6)", border: "1px solid #2a3942",
              borderRadius: 16, padding: "48px 24px", textAlign: "center",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📭</div>
              <div style={{ fontSize: 14, color: "#8696a0" }}>Sin celulares registrados.</div>
              <div style={{ fontSize: 12, color: "#3a4a52", marginTop: 8 }}>
                Registra los celulares en Settings → Gestionar celulares WA.
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ marginTop: 36, fontSize: 10, color: "#1f2c34", textAlign: "center" }}>
            Actualización automática cada 30 s · Goberna
          </div>
        </div>
      </div>
    </>
  );
}
