"use client";

/**
 * GOBERNA — Extension Monitor (Public)
 * Marca: #FFC800 (dorado) + #163960 (navy)
 * Sin márgenes laterales. Phones grandes y vistosos.
 */

import { useEffect, useState, useCallback } from "react";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
  type ExtensionMonitorOperator,
  type ExtensionMonitorTotals,
} from "@/lib/services/cms";

// ── Paleta Goberna ────────────────────────────────────────────────────
const G = {
  gold:        "#FFC800",
  goldDim:     "#CC9F00",
  goldGlow:    "rgba(255,200,0,0.18)",
  goldSoft:    "rgba(255,200,0,0.08)",
  navy:        "#163960",
  navyLight:   "#1e4d7a",
  navyDark:    "#0e2640",
  navyDeep:    "#09192b",
  bg:          "#0b1622",
  surface:     "#101f30",
  surfaceUp:   "#152840",
  border:      "rgba(255,255,255,0.07)",
  borderActive:"rgba(255,200,0,0.30)",
  text:        "#e9edef",
  textMid:     "#8696a0",
  textDim:     "#3d5570",
  green:       "#00a884",
  greenGlow:   "rgba(0,168,132,0.20)",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function firstName(full: string, email: string) {
  return full.split(" ")[0] || email.split("@")[0] || "—";
}
function initial(full: string, email: string) {
  return (full[0] || email[0] || "?").toUpperCase();
}
function fmtNum(n: string) {
  if (n === "desconocido") return "Desconocido";
  if (n.length >= 11) {
    const cc = n.slice(0, 2), r = n.slice(2);
    return `+${cc} ${r.slice(0,3)} ${r.slice(3,6)} ${r.slice(6)}`.trim();
  }
  return `+${n}`;
}

// ── StatBadge ─────────────────────────────────────────────────────────

function StatBadge({ value, label, active }: { value: number; label: string; active: boolean }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      padding: "12px 6px 10px",
      background: active ? "rgba(255,200,0,0.06)" : "rgba(255,255,255,0.03)",
      borderRadius: 12,
      border: `1px solid ${active ? "rgba(255,200,0,0.15)" : "rgba(255,255,255,0.04)"}`,
    }}>
      <span style={{
        fontSize: 26, fontWeight: 900, lineHeight: 1, letterSpacing: "-1px",
        color: active ? G.gold : G.textDim,
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, marginTop: 5, letterSpacing: "0.8px",
        textTransform: "uppercase", color: active ? G.goldDim : G.textDim,
      }}>
        {label}
      </span>
    </div>
  );
}

// ── OperatorRow ───────────────────────────────────────────────────────

function OperatorRow({ op, maxSent }: { op: ExtensionMonitorOperator; maxSent: number }) {
  const pct = maxSent > 0 ? (op.wa_sent / maxSent) * 100 : 0;
  const active = op.wa_sent > 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 0",
      borderBottom: `1px solid ${G.border}`,
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: active ? "rgba(255,200,0,0.12)" : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${active ? "rgba(255,200,0,0.35)" : "transparent"}`,
        color: active ? G.gold : G.textDim,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 900,
      }}>
        {initial(op.full_name, op.email)}
      </div>
      {/* Name + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 700,
          color: active ? G.text : G.textDim,
          marginBottom: 4,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {firstName(op.full_name, op.email)}
        </div>
        <div style={{ height: 4, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 3,
            background: active
              ? "linear-gradient(90deg, #FFC800, #FFD84D)"
              : "transparent",
            transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>
      </div>
      {/* Count */}
      <span style={{
        flexShrink: 0, minWidth: 24, textAlign: "right",
        fontSize: 15, fontWeight: 900,
        color: active ? G.gold : G.textDim,
      }}>
        {op.wa_sent}
      </span>
    </div>
  );
}

// ── PhoneCard ─────────────────────────────────────────────────────────

function PhoneCard({ phone }: { phone: ExtensionMonitorPhone }) {
  const name = phone.alias ?? fmtNum(phone.own_number);
  const maxOp = phone.operators.reduce((m, o) => Math.max(m, o.wa_sent), 0);
  const active = phone.wa_sent > 0;
  const activeOps = phone.operators.filter(o => o.wa_sent > 0).sort((a, b) => b.wa_sent - a.wa_sent);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* ── Outer device shell ── */}
      <div style={{
        width: "100%",
        aspectRatio: "9 / 18",
        position: "relative",
        borderRadius: 36,
        /* Outer rim — physical frame */
        background: active
          ? `linear-gradient(145deg, ${G.gold} 0%, ${G.goldDim} 40%, #a07800 100%)`
          : `linear-gradient(145deg, #1e3050 0%, #152438 60%, #0e1c2e 100%)`,
        padding: "3px",
        boxShadow: active
          ? `0 0 0 1px rgba(255,200,0,0.5),
             0 20px 60px rgba(0,0,0,0.7),
             0 0 40px rgba(255,200,0,0.15),
             inset 0 1px 0 rgba(255,255,255,0.2)`
          : `0 8px 32px rgba(0,0,0,0.6),
             0 0 0 1px rgba(255,255,255,0.05),
             inset 0 1px 0 rgba(255,255,255,0.04)`,
        transition: "box-shadow 0.4s ease",
      }}>

        {/* ── Inner screen body ── */}
        <div style={{
          width: "100%", height: "100%",
          borderRadius: 33,
          background: active
            ? `linear-gradient(175deg, #0f2a22 0%, #0a1e18 50%, #061410 100%)`
            : `linear-gradient(175deg, #0f1e30 0%, #091525 50%, #050e1a 100%)`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}>

          {/* Top status bar */}
          <div style={{
            height: 34, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.3)",
            borderBottom: `1px solid ${active ? "rgba(255,200,0,0.08)" : G.border}`,
            position: "relative",
          }}>
            {/* Notch */}
            <div style={{
              width: 56, height: 10, borderRadius: 5,
              background: "rgba(0,0,0,0.7)",
              border: "1px solid rgba(255,255,255,0.06)",
            }} />
            {/* Live indicator */}
            {active ? (
              <div style={{
                position: "absolute", right: 14,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: G.gold,
                  boxShadow: `0 0 10px ${G.gold}, 0 0 20px rgba(255,200,0,0.4)`,
                  animation: "gobPulse 2s ease-in-out infinite",
                }} />
              </div>
            ) : (
              <div style={{
                position: "absolute", right: 14,
                width: 8, height: 8, borderRadius: "50%",
                background: G.textDim, opacity: 0.3,
              }} />
            )}
          </div>

          {/* Screen content */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            padding: "14px 14px 10px",
            gap: 10, overflow: "hidden",
          }}>

            {/* Phone name */}
            <div>
              <div style={{
                fontSize: 17, fontWeight: 900, lineHeight: 1.1,
                letterSpacing: "-0.4px",
                color: active ? G.gold : G.textDim,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {name}
              </div>
              {phone.alias && (
                <div style={{
                  fontSize: 10, marginTop: 3,
                  color: active ? "rgba(255,200,0,0.4)" : G.textDim,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {fmtNum(phone.own_number)}
                </div>
              )}
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 6 }}>
              <StatBadge value={phone.wa_sent}       label="Env"  active={active} />
              <StatBadge value={phone.unique_contacts} label="Ctc" active={active} />
              <StatBadge value={activeOps.length}    label="Ops"  active={active} />
            </div>

            {/* Divider */}
            <div style={{
              height: 1,
              background: active
                ? "linear-gradient(90deg, transparent, rgba(255,200,0,0.2), transparent)"
                : "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)",
            }} />

            {/* Operators */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {activeOps.length === 0 ? (
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <div style={{ fontSize: 28, opacity: 0.12 }}>📵</div>
                  <div style={{
                    fontSize: 11, color: G.textDim,
                    textAlign: "center", lineHeight: 1.5,
                  }}>
                    Esperando actividad
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {activeOps.slice(0, 7).map(op => (
                    <OperatorRow key={op.operator_id} op={op} maxSent={maxOp} />
                  ))}
                </div>
              )}
            </div>

            {/* Last event */}
            <div style={{
              paddingTop: 8,
              borderTop: `1px solid ${G.border}`,
              display: "flex", alignItems: "center",
              justifyContent: active ? "space-between" : "center",
            }}>
              {active ? (
                <>
                  <span style={{ fontSize: 10, color: G.textDim }}>Último evento</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,200,0,0.5)" }}>
                    {formatRelative(phone.last_event_at)}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 10, color: G.textDim }}>Sin actividad</span>
              )}
            </div>
          </div>

          {/* Home bar */}
          <div style={{
            height: 28, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.25)",
            borderTop: `1px solid ${G.border}`,
          }}>
            <div style={{
              width: 44, height: 5, borderRadius: 3,
              background: active
                ? "rgba(255,200,0,0.25)"
                : "rgba(255,255,255,0.10)",
            }} />
          </div>
        </div>
      </div>

      {/* Label under phone */}
      <div style={{
        marginTop: 12,
        fontSize: 12, fontWeight: 800,
        color: active ? G.gold : G.textDim,
        letterSpacing: "0.2px", textAlign: "center",
        textTransform: "uppercase",
      }}>
        {name}
      </div>
      {active && (
        <div style={{
          marginTop: 4,
          fontSize: 10, fontWeight: 600,
          color: G.green,
          letterSpacing: "0.5px",
        }}>
          ● ACTIVO
        </div>
      )}
    </div>
  );
}

// ── Header stat card ──────────────────────────────────────────────────

function TopStat({ label, value, gold }: { label: string; value: number | string; gold?: boolean }) {
  return (
    <div style={{
      flex: "1 1 0",
      background: gold
        ? `linear-gradient(135deg, rgba(255,200,0,0.10) 0%, rgba(255,200,0,0.04) 100%)`
        : `linear-gradient(135deg, ${G.surfaceUp} 0%, ${G.surface} 100%)`,
      border: `1px solid ${gold ? "rgba(255,200,0,0.25)" : G.border}`,
      borderRadius: 16,
      padding: "20px 24px",
    }}>
      <div style={{
        fontSize: 38, fontWeight: 900, lineHeight: 1,
        letterSpacing: "-2px",
        color: gold ? G.gold : G.text,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, marginTop: 8,
        textTransform: "uppercase", letterSpacing: "0.8px",
        color: gold ? G.goldDim : G.textMid,
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "eece49d5-a315-4764-83f9-681cabae5c51";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif";

export default function ExtensionMonitorPage() {
  const [phones, setPhones]     = useState<ExtensionMonitorPhone[]>([]);
  const [totals, setTotals]     = useState<ExtensionMonitorTotals | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [lastAt, setLastAt]     = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await getExtensionMonitor(CAMPAIGN_ID);
    setLoading(false);
    if (!r.ok) { setError(r.error ?? "Error"); return; }
    setPhones(r.phones ?? []);
    setTotals(r.totals ?? null);
    setLastAt(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const activeCount = phones.filter(p => p.wa_sent > 0).length;

  return (
    <>
      <style>{`
        @keyframes gobPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.5; transform:scale(0.8); }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: G.bg,
        color: G.text,
        fontFamily: FONT,
      }}>

        {/* ── Top banner ── */}
        <div style={{
          background: `linear-gradient(135deg, ${G.navyDark} 0%, ${G.navy} 60%, ${G.navyLight} 100%)`,
          borderBottom: `2px solid ${G.gold}`,
          padding: "0 32px",
        }}>
          <div style={{
            maxWidth: "none",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 64, gap: 16,
          }}>
            {/* Logo area */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: G.gold,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 900, color: G.navyDark,
                letterSpacing: "-1px", flexShrink: 0,
              }}>
                G
              </div>
              <div>
                <div style={{
                  fontSize: 16, fontWeight: 900, color: G.gold,
                  letterSpacing: "2px", textTransform: "uppercase",
                }}>
                  GOBERNA
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,200,0,0.5)", fontWeight: 600, letterSpacing: "0.5px" }}>
                  Monitor de Extensión
                </div>
              </div>
            </div>

            {/* Right: time + refresh */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {lastAt && (
                <span style={{
                  fontSize: 11, color: "rgba(255,200,0,0.4)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {lastAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                type="button"
                onClick={load}
                disabled={loading}
                style={{
                  padding: "7px 16px", borderRadius: 8,
                  border: `1px solid rgba(255,200,0,0.35)`,
                  background: loading ? "transparent" : "rgba(255,200,0,0.10)",
                  color: loading ? "rgba(255,200,0,0.3)" : G.gold,
                  fontSize: 12, cursor: loading ? "default" : "pointer",
                  fontWeight: 800, letterSpacing: "0.3px",
                  transition: "all 0.2s",
                }}
              >
                {loading ? "Cargando..." : "↻ Actualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Subtitle bar ── */}
        <div style={{
          background: G.navyDeep,
          padding: "10px 32px",
          borderBottom: `1px solid rgba(255,200,0,0.08)`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "rgba(255,200,0,0.5)", fontWeight: 600 }}>
            WhatsApp Web · Celulares César Vásquez · Campaña activa
          </span>
          <span style={{
            fontSize: 11, color: G.textDim,
            fontVariantNumeric: "tabular-nums",
          }}>
            Auto-refresh 30s
          </span>
        </div>

        {/* ── Content ── */}
        <div style={{ padding: "28px 32px 64px" }}>

          {/* Error */}
          {error && (
            <div style={{
              background: "rgba(239,83,80,0.08)", border: "1px solid rgba(239,83,80,0.3)",
              borderRadius: 10, padding: "12px 18px", marginBottom: 24,
              fontSize: 13, color: "#ef5350",
            }}>
              {error}
            </div>
          )}

          {/* ── Totals row ── */}
          {totals && (
            <div style={{ display: "flex", gap: 12, marginBottom: 36, flexWrap: "wrap" }}>
              <TopStat label="Mensajes enviados"   value={totals.wa_sent}          gold />
              <TopStat label="Contactos únicos"    value={totals.unique_contacts} />
              <TopStat label="Operadoras activas"  value={totals.active_operators} />
              <TopStat label="Celulares activos"   value={`${activeCount} / ${phones.length}`} />
            </div>
          )}

          {/* ── Loading ── */}
          {loading && phones.length === 0 && (
            <div style={{ padding: "80px 0", textAlign: "center", color: G.textDim, fontSize: 14 }}>
              Cargando datos...
            </div>
          )}

          {/* ── Phone grid ── */}
          {phones.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 20,
              alignItems: "start",
            }}>
              {phones.map(phone => (
                <PhoneCard key={phone.own_number} phone={phone} />
              ))}
            </div>
          )}

          {/* ── Empty state ── */}
          {!loading && phones.length === 0 && !error && (
            <div style={{
              background: G.surface, border: `1px solid ${G.border}`,
              borderRadius: 16, padding: "56px 24px", textAlign: "center",
            }}>
              <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 14 }}>📵</div>
              <div style={{ fontSize: 14, color: G.textMid }}>Sin celulares registrados.</div>
              <div style={{ fontSize: 12, color: G.textDim, marginTop: 8 }}>
                Registra los celulares en Settings → Gestionar celulares WA.
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop: `1px solid ${G.border}`,
          padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 10, color: G.textDim }}>
            Goberna · Plataforma de Operación Territorial
          </span>
          <span style={{ fontSize: 10, color: G.textDim }}>
            {lastAt
              ? `Última actualización: ${lastAt.toLocaleTimeString("es-PE")}`
              : "—"}
          </span>
        </div>
      </div>
    </>
  );
}
