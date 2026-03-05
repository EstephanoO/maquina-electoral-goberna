"use client";

/**
 * GOBERNA — Extension Monitor (Public)
 * Marca: #FFC800 (dorado) + #163960 (navy)
 * Usa el componente Iphone de magicui como frame físico real.
 */

import { useEffect, useState, useCallback } from "react";
import { Iphone } from "@/components/magicui/iphone";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
  type ExtensionMonitorOperator,
  type ExtensionMonitorTotals,
} from "@/lib/services/cms";

// ── Paleta Goberna ────────────────────────────────────────────────────
const G = {
  gold:      "#FFC800",
  goldDim:   "#CC9F00",
  goldFaint: "rgba(255,200,0,0.12)",
  goldGlow:  "rgba(255,200,0,0.22)",
  navy:      "#163960",
  navyLight: "#1e4d7a",
  navyDark:  "#0e2640",
  navyDeep:  "#08192a",
  bg:        "#0a1520",
  surface:   "#0f1e2e",
  surfaceUp: "#152840",
  border:    "rgba(255,255,255,0.07)",
  text:      "#e9edef",
  textMid:   "#8696a0",
  textDim:   "#3d5570",
  green:     "#00a884",
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

// ── OperatorRow ───────────────────────────────────────────────────────

function OperatorRow({ op, maxSent }: { op: ExtensionMonitorOperator; maxSent: number }) {
  const pct    = maxSent > 0 ? (op.wa_sent / maxSent) * 100 : 0;
  const active = op.wa_sent > 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "6px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        background: active ? "rgba(255,200,0,0.12)" : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${active ? "rgba(255,200,0,0.4)" : "transparent"}`,
        color: active ? G.gold : G.textDim,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 900,
      }}>
        {initial(op.full_name, op.email)}
      </div>
      {/* Name + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: active ? G.text : G.textDim,
          marginBottom: 3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {firstName(op.full_name, op.email)}
        </div>
        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 2,
            background: active ? "linear-gradient(90deg,#FFC800,#FFE066)" : "transparent",
            transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>
      </div>
      {/* Count */}
      <span style={{
        flexShrink: 0, minWidth: 22, textAlign: "right",
        fontSize: 14, fontWeight: 900,
        color: active ? G.gold : G.textDim,
      }}>
        {op.wa_sent}
      </span>
    </div>
  );
}

// ── PhoneScreen — content rendered inside the Iphone frame ───────────

function PhoneScreen({ phone }: { phone: ExtensionMonitorPhone }) {
  const name      = phone.alias ?? fmtNum(phone.own_number);
  const maxOp     = phone.operators.reduce((m, o) => Math.max(m, o.wa_sent), 0);
  const active    = phone.wa_sent > 0;
  const activeOps = phone.operators
    .filter(o => o.wa_sent > 0)
    .sort((a, b) => b.wa_sent - a.wa_sent);

  return (
    <div style={{
      width: "100%", height: "100%",
      background: active
        ? "linear-gradient(175deg, #0c2218 0%, #071810 60%, #040e0a 100%)"
        : "linear-gradient(175deg, #0b1929 0%, #071220 60%, #040b14 100%)",
      display: "flex", flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: "hidden",
    }}>

      {/* Status bar */}
      <div style={{
        height: "8%", flexShrink: 0,
        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
        padding: "0 10% 6px",
        background: "rgba(0,0,0,0.25)",
      }}>
        {active && (
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: G.gold,
            boxShadow: `0 0 8px ${G.gold}, 0 0 16px ${G.goldGlow}`,
            animation: "gobPulse 2s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: "8% 8% 6%",
        gap: "5%",
        overflow: "hidden",
      }}>

        {/* Name */}
        <div>
          <div style={{
            fontSize: "clamp(13px,4.5%,18px)", fontWeight: 900,
            color: active ? G.gold : G.textDim,
            letterSpacing: "-0.3px", lineHeight: 1.1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {name}
          </div>
          {phone.alias && (
            <div style={{
              fontSize: "clamp(8px,2.8%,11px)", marginTop: "4%",
              color: active ? "rgba(255,200,0,0.35)" : G.textDim,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {fmtNum(phone.own_number)}
            </div>
          )}
        </div>

        {/* Stat pills */}
        <div style={{ display: "flex", gap: "3%" }}>
          {[
            { v: phone.wa_sent,         l: "ENV" },
            { v: phone.unique_contacts, l: "CTC" },
            { v: activeOps.length,      l: "OPS" },
          ].map(({ v, l }) => (
            <div key={l} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              padding: "8% 4%",
              background: active ? "rgba(255,200,0,0.06)" : "rgba(255,255,255,0.03)",
              borderRadius: "12%",
              border: `1px solid ${active ? "rgba(255,200,0,0.18)" : "rgba(255,255,255,0.05)"}`,
            }}>
              <span style={{
                fontSize: "clamp(16px,6%,26px)", fontWeight: 900, lineHeight: 1,
                letterSpacing: "-1px",
                color: active ? G.gold : G.textDim,
              }}>
                {v}
              </span>
              <span style={{
                fontSize: "clamp(7px,2.5%,10px)", fontWeight: 700, marginTop: "12%",
                letterSpacing: "0.8px", textTransform: "uppercase",
                color: active ? G.goldDim : G.textDim,
              }}>
                {l}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{
          height: 1,
          background: active
            ? "linear-gradient(90deg,transparent,rgba(255,200,0,0.25),transparent)"
            : "linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)",
        }} />

        {/* Operators */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {activeOps.length === 0 ? (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "6%",
            }}>
              <div style={{ fontSize: "clamp(20px,8%,32px)", opacity: 0.12 }}>📵</div>
              <div style={{ fontSize: "clamp(9px,3%,12px)", color: G.textDim, textAlign: "center" }}>
                Sin actividad
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
          paddingTop: "4%",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center",
          justifyContent: active ? "space-between" : "center",
        }}>
          {active ? (
            <>
              <span style={{ fontSize: "clamp(8px,2.8%,11px)", color: G.textDim }}>Último</span>
              <span style={{
                fontSize: "clamp(8px,2.8%,11px)", fontWeight: 700,
                color: "rgba(255,200,0,0.5)",
              }}>
                {formatRelative(phone.last_event_at)}
              </span>
            </>
          ) : (
            <span style={{ fontSize: "clamp(8px,2.8%,11px)", color: G.textDim }}>
              Esperando actividad...
            </span>
          )}
        </div>
      </div>

      {/* Home indicator area */}
      <div style={{
        height: "6%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.2)",
      }}>
        <div style={{
          width: "35%", height: 4, borderRadius: 2,
          background: active ? "rgba(255,200,0,0.2)" : "rgba(255,255,255,0.08)",
        }} />
      </div>
    </div>
  );
}

// ── PhoneCard — Iphone frame wrapping PhoneScreen ────────────────────

function PhoneCard({ phone }: { phone: ExtensionMonitorPhone }) {
  const active = phone.wa_sent > 0;
  const name   = phone.alias ?? fmtNum(phone.own_number);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Glow ring behind the phone when active */}
      <div style={{
        position: "relative",
        width: "100%",
        filter: active
          ? "drop-shadow(0 0 18px rgba(255,200,0,0.30)) drop-shadow(0 12px 40px rgba(0,0,0,0.7))"
          : "drop-shadow(0 8px 28px rgba(0,0,0,0.6))",
        transition: "filter 0.4s ease",
      }}>
        <Iphone
          frameColor={active ? G.gold : "#1e3554"}
          screenColor={active ? "#0c2218" : "#0b1929"}
        >
          <PhoneScreen phone={phone} />
        </Iphone>
      </div>

      {/* Label below */}
      <div style={{
        marginTop: 14, textAlign: "center",
      }}>
        <div style={{
          fontSize: 13, fontWeight: 800,
          color: active ? G.gold : G.textDim,
          letterSpacing: "0.5px", textTransform: "uppercase",
        }}>
          {name}
        </div>
        {active && (
          <div style={{
            marginTop: 5, fontSize: 10, fontWeight: 700,
            color: G.green, letterSpacing: "1px",
          }}>
            ● ACTIVO
          </div>
        )}
      </div>
    </div>
  );
}

// ── TopStat ───────────────────────────────────────────────────────────

function TopStat({ label, value, gold }: { label: string; value: number | string; gold?: boolean }) {
  return (
    <div style={{
      flex: "1 1 0",
      background: gold
        ? "linear-gradient(135deg,rgba(255,200,0,0.12) 0%,rgba(255,200,0,0.04) 100%)"
        : `linear-gradient(135deg,${G.surfaceUp} 0%,${G.surface} 100%)`,
      border: `1px solid ${gold ? "rgba(255,200,0,0.28)" : G.border}`,
      borderRadius: 16, padding: "20px 24px",
    }}>
      <div style={{
        fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: "-2px",
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
  const [phones, setPhones]   = useState<ExtensionMonitorPhone[]>([]);
  const [totals, setTotals]   = useState<ExtensionMonitorTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [lastAt, setLastAt]   = useState<Date | null>(null);

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
          50%      { opacity:0.45; transform:scale(0.75); }
        }
        * { box-sizing:border-box; }
      `}</style>

      <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: FONT }}>

        {/* ── Top banner ── */}
        <div style={{
          background: `linear-gradient(135deg, ${G.navyDark} 0%, ${G.navy} 60%, ${G.navyLight} 100%)`,
          borderBottom: `2px solid ${G.gold}`,
          padding: "0 32px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 64, gap: 16,
          }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 9,
                background: G.gold,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 900, color: G.navyDark,
                letterSpacing: "-1px", flexShrink: 0,
              }}>
                G
              </div>
              <div>
                <div style={{
                  fontSize: 16, fontWeight: 900, color: G.gold,
                  letterSpacing: "3px", textTransform: "uppercase",
                }}>
                  GOBERNA
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,200,0,0.45)", fontWeight: 600, letterSpacing: "0.3px" }}>
                  Monitor de Extensión WA
                </div>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {lastAt && (
                <span style={{
                  fontSize: 11, color: "rgba(255,200,0,0.35)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {lastAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                type="button" onClick={load} disabled={loading}
                style={{
                  padding: "7px 18px", borderRadius: 8,
                  border: "1px solid rgba(255,200,0,0.35)",
                  background: loading ? "transparent" : "rgba(255,200,0,0.10)",
                  color: loading ? "rgba(255,200,0,0.3)" : G.gold,
                  fontSize: 12, cursor: loading ? "default" : "pointer",
                  fontWeight: 800, letterSpacing: "0.3px",
                }}
              >
                {loading ? "Cargando..." : "↻ Actualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Sub-bar ── */}
        <div style={{
          background: G.navyDeep,
          padding: "10px 32px",
          borderBottom: "1px solid rgba(255,200,0,0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "rgba(255,200,0,0.45)", fontWeight: 600 }}>
            WhatsApp Web · Celulares César Vásquez
          </span>
          <span style={{ fontSize: 11, color: G.textDim }}>Auto-refresh 30 s</span>
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

          {/* Totals */}
          {totals && (
            <div style={{ display: "flex", gap: 12, marginBottom: 40, flexWrap: "wrap" }}>
              <TopStat label="Mensajes enviados"  value={totals.wa_sent}          gold />
              <TopStat label="Contactos únicos"   value={totals.unique_contacts} />
              <TopStat label="Operadoras activas" value={totals.active_operators} />
              <TopStat label="Celulares activos"  value={`${activeCount} / ${phones.length}`} />
            </div>
          )}

          {/* Loading */}
          {loading && phones.length === 0 && (
            <div style={{ padding: "80px 0", textAlign: "center", color: G.textDim, fontSize: 14 }}>
              Cargando datos...
            </div>
          )}

          {/* Phone grid */}
          {phones.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 28,
              alignItems: "start",
            }}>
              {phones.map(phone => (
                <PhoneCard key={phone.own_number} phone={phone} />
              ))}
            </div>
          )}

          {/* Empty state */}
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

        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${G.border}`,
          padding: "16px 32px",
          display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 10, color: G.textDim }}>Goberna · Plataforma de Operación Territorial</span>
          <span style={{ fontSize: 10, color: G.textDim }}>
            {lastAt ? `Última actualización: ${lastAt.toLocaleTimeString("es-PE")}` : "—"}
          </span>
        </div>
      </div>
    </>
  );
}
