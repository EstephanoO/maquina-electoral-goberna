"use client";

/**
 * GOBERNA — Extension Monitor (Public)
 * War-room dashboard: fondo oscuro, celulares prominentes, stats impactantes.
 * Paleta: #FFC800 (dorado) + #163960 (navy)
 */

import { useEffect, useState, useCallback } from "react";
import { Iphone } from "@/components/magicui/iphone";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
  type ExtensionMonitorOperator,
  type ExtensionMonitorTotals,
} from "@/lib/services/cms";

// ── Paleta ────────────────────────────────────────────────────────────
const G = {
  gold:        "#FFC800",
  goldDim:     "#CC9F00",
  goldFaint:   "rgba(255,200,0,0.10)",
  goldGlow:    "rgba(255,200,0,0.20)",
  goldBorder:  "rgba(255,200,0,0.25)",
  navy:        "#163960",
  navyLight:   "#1e4d7a",
  navyDark:    "#0e2640",
  navyDeep:    "#08192a",
  bg:          "#060e18",
  surface:     "#0c1a28",
  surfaceUp:   "#112236",
  border:      "rgba(255,255,255,0.06)",
  borderMid:   "rgba(255,255,255,0.10)",
  text:        "#e9eef3",
  textMid:     "#7a95aa",
  textDim:     "#334d63",
  green:       "#22c55e",
  greenDim:    "rgba(34,197,94,0.15)",
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
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: active ? "rgba(255,200,0,0.14)" : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${active ? "rgba(255,200,0,0.45)" : "rgba(255,255,255,0.08)"}`,
        color: active ? G.gold : G.textDim,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 900,
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
        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 2,
            background: active ? "linear-gradient(90deg,#FFC800,#FFE066)" : "transparent",
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

// ── PhoneScreen — contenido dentro del frame Iphone ──────────────────
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
        ? "linear-gradient(175deg, #111c2e 0%, #0a1520 55%, #060d18 100%)"
        : "linear-gradient(175deg, #0d1825 0%, #080f1a 55%, #04090f 100%)",
      display: "flex", flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: "hidden",
    }}>

      {/* Status bar */}
      <div style={{
        height: "7%", flexShrink: 0,
        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
        padding: "0 10% 5px",
        background: "rgba(0,0,0,0.2)",
      }}>
        {active && (
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: G.gold,
            boxShadow: `0 0 8px ${G.gold}`,
            animation: "gobPulse 2.5s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: "7% 9% 5%", gap: "5%",
        overflow: "hidden",
      }}>

        {/* Phone name */}
        <div>
          <div style={{
            fontSize: "clamp(13px,4.8%,20px)", fontWeight: 900,
            color: active ? G.gold : G.textMid,
            letterSpacing: "-0.3px", lineHeight: 1.1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {name}
          </div>
          {phone.alias && (
            <div style={{
              fontSize: "clamp(8px,2.8%,11px)", marginTop: "5%",
              color: active ? "rgba(255,200,0,0.40)" : G.textDim,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {fmtNum(phone.own_number)}
            </div>
          )}
        </div>

        {/* Stat pills */}
        <div style={{ display: "flex", gap: "4%" }}>
          {[
            { v: phone.wa_sent,         l: "ENV" },
            { v: phone.unique_contacts, l: "CTC" },
            { v: activeOps.length,      l: "OPS" },
          ].map(({ v, l }) => (
            <div key={l} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              padding: "9% 2%",
              background: active ? "rgba(255,200,0,0.07)" : "rgba(255,255,255,0.03)",
              borderRadius: "14%",
              border: `1px solid ${active ? "rgba(255,200,0,0.20)" : "rgba(255,255,255,0.06)"}`,
            }}>
              <span style={{
                fontSize: "clamp(17px,6.5%,28px)", fontWeight: 900, lineHeight: 1,
                letterSpacing: "-1px",
                color: active ? G.gold : G.textDim,
              }}>
                {v}
              </span>
              <span style={{
                fontSize: "clamp(7px,2.4%,10px)", fontWeight: 700, marginTop: "14%",
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
            ? "linear-gradient(90deg,transparent,rgba(255,200,0,0.20),transparent)"
            : "linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)",
        }} />

        {/* Operators */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {activeOps.length === 0 ? (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "6%",
            }}>
              <div style={{ fontSize: "clamp(22px,8%,32px)", opacity: 0.10 }}>📵</div>
              <div style={{ fontSize: "clamp(9px,3%,11px)", color: G.textDim, textAlign: "center" }}>
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
                color: "rgba(255,200,0,0.55)",
              }}>
                {formatRelative(phone.last_event_at)}
              </span>
            </>
          ) : (
            <span style={{ fontSize: "clamp(8px,2.8%,11px)", color: G.textDim }}>
              Esperando...
            </span>
          )}
        </div>
      </div>

      {/* Home indicator */}
      <div style={{
        height: "5%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.15)",
      }}>
        <div style={{
          width: "32%", height: 3, borderRadius: 2,
          background: active ? "rgba(255,200,0,0.22)" : "rgba(255,255,255,0.07)",
        }} />
      </div>
    </div>
  );
}

// ── PhoneCard ─────────────────────────────────────────────────────────
function PhoneCard({ phone }: { phone: ExtensionMonitorPhone }) {
  const active = phone.wa_sent > 0;
  const name   = phone.alias ?? fmtNum(phone.own_number);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {/* Frame + glow */}
      <div style={{
        position: "relative", width: "100%",
        filter: active
          ? "drop-shadow(0 0 24px rgba(255,200,0,0.28)) drop-shadow(0 16px 48px rgba(0,0,0,0.8))"
          : "drop-shadow(0 8px 32px rgba(0,0,0,0.7))",
        transition: "filter 0.5s ease",
      }}>
        <Iphone
          frameColor="#000000"
          screenColor={active ? "#111c2e" : "#0d1825"}
        >
          <PhoneScreen phone={phone} />
        </Iphone>
      </div>

      {/* Label */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 13, fontWeight: 800, letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: active ? G.gold : G.textDim,
        }}>
          {name}
        </div>
        <div style={{
          marginTop: 6, fontSize: 11, fontWeight: 700,
          letterSpacing: "1.2px",
          color: active ? G.green : G.textDim,
        }}>
          {active ? "● ACTIVO" : "○ EN ESPERA"}
        </div>
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, gold, accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  gold?: boolean;
  accent?: boolean;
}) {
  return (
    <div style={{
      flex: "1 1 0",
      background: gold
        ? `linear-gradient(135deg, rgba(255,200,0,0.12) 0%, rgba(255,200,0,0.04) 100%)`
        : accent
        ? `linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)`
        : `linear-gradient(135deg, ${G.surfaceUp} 0%, ${G.surface} 100%)`,
      border: `1px solid ${gold ? G.goldBorder : accent ? "rgba(34,197,94,0.20)" : G.border}`,
      borderRadius: 18,
      padding: "22px 26px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Accent line top */}
      <div style={{
        position: "absolute", top: 0, left: 24, right: 24, height: 2, borderRadius: "0 0 2px 2px",
        background: gold ? G.gold : accent ? G.green : "transparent",
        opacity: gold || accent ? 0.6 : 0,
      }} />
      <div style={{
        fontSize: 44, fontWeight: 900, lineHeight: 1, letterSpacing: "-2px",
        color: gold ? G.gold : accent ? G.green : G.text,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, marginTop: 10,
        textTransform: "uppercase", letterSpacing: "0.8px",
        color: gold ? G.goldDim : accent ? "rgba(34,197,94,0.7)" : G.textMid,
      }}>
        {label}
      </div>
      {sub && (
        <div style={{
          fontSize: 11, marginTop: 4, color: G.textDim, fontWeight: 500,
        }}>
          {sub}
        </div>
      )}
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
  const inactiveCount = phones.length - activeCount;

  // Grid responsive: max 5 cols, mínimo que llene bien
  const cols = Math.min(phones.length, 5) || 3;

  return (
    <>
      <style>{`
        @keyframes gobPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(0.7); }
        }
        @keyframes fadeIn {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,200,0,0.15); border-radius:3px; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(22,57,96,0.35) 0%, transparent 70%), ${G.bg}`,
        color: G.text,
        fontFamily: FONT,
      }}>

        {/* ── Header ── */}
        <div style={{
          background: `linear-gradient(180deg, rgba(14,38,64,0.95) 0%, rgba(10,28,50,0.85) 100%)`,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid rgba(255,200,0,0.15)`,
          padding: "0 32px",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            height: 60, gap: 20,
          }}>
            {/* Logo + título */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: G.gold,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 900, color: G.navyDark,
                letterSpacing: "-1px", flexShrink: 0,
                boxShadow: `0 0 20px rgba(255,200,0,0.25)`,
              }}>
                G
              </div>
              <div>
                <div style={{
                  fontSize: 15, fontWeight: 900, color: G.gold,
                  letterSpacing: "3px", textTransform: "uppercase",
                }}>
                  GOBERNA
                </div>
                <div style={{
                  fontSize: 10, color: "rgba(255,200,0,0.40)",
                  fontWeight: 600, letterSpacing: "0.3px", marginTop: 1,
                }}>
                  Monitor WhatsApp Web
                </div>
              </div>
            </div>

            {/* Centro — estado live */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 14px", borderRadius: 20,
              background: activeCount > 0 ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${activeCount > 0 ? "rgba(34,197,94,0.20)" : G.border}`,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: activeCount > 0 ? G.green : G.textDim,
                boxShadow: activeCount > 0 ? `0 0 6px ${G.green}` : "none",
                animation: activeCount > 0 ? "gobPulse 2.5s ease-in-out infinite" : "none",
              }} />
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: activeCount > 0 ? G.green : G.textDim,
                letterSpacing: "0.3px",
              }}>
                {activeCount > 0 ? `${activeCount} celular${activeCount !== 1 ? "es" : ""} activo${activeCount !== 1 ? "s" : ""}` : "Sin actividad"}
              </span>
            </div>

            {/* Derecha — tiempo + refresh */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {lastAt && (
                <span style={{
                  fontSize: 12, color: G.textDim,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {lastAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                type="button" onClick={load} disabled={loading}
                style={{
                  padding: "7px 16px", borderRadius: 8,
                  border: `1px solid ${loading ? "rgba(255,200,0,0.15)" : G.goldBorder}`,
                  background: loading ? "transparent" : G.goldFaint,
                  color: loading ? G.textDim : G.gold,
                  fontSize: 12, cursor: loading ? "default" : "pointer",
                  fontWeight: 800, letterSpacing: "0.3px",
                  transition: "all 0.2s ease",
                }}
              >
                {loading ? "···" : "↻ Actualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Subheader contextual ── */}
        <div style={{
          padding: "10px 32px",
          borderBottom: `1px solid ${G.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(0,0,0,0.15)",
        }}>
          <span style={{
            fontSize: 12, color: G.textMid, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: G.textDim }}>●</span>
            Celulares César Vásquez · Campaña activa
          </span>
          <span style={{ fontSize: 11, color: G.textDim }}>Auto-refresh cada 30 s</span>
        </div>

        {/* ── Contenido ── */}
        <div style={{ padding: "28px 32px 60px" }}>

          {/* Error */}
          {error && (
            <div style={{
              background: "rgba(239,83,80,0.07)", border: "1px solid rgba(239,83,80,0.25)",
              borderRadius: 12, padding: "12px 18px", marginBottom: 28,
              fontSize: 13, color: "#ef5350",
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Stat cards */}
          {totals && (
            <div style={{
              display: "flex", gap: 14, marginBottom: 40, flexWrap: "wrap",
              animation: "fadeIn 0.4s ease",
            }}>
              <StatCard label="Mensajes enviados"  value={totals.wa_sent}          gold />
              <StatCard label="Contactos únicos"   value={totals.unique_contacts} />
              <StatCard label="Operadoras activas" value={totals.active_operators} />
              <StatCard
                label="Celulares activos"
                value={activeCount}
                sub={inactiveCount > 0 ? `${inactiveCount} en espera` : "Todos activos"}
                accent={activeCount > 0}
              />
            </div>
          )}

          {/* Loading inicial */}
          {loading && phones.length === 0 && (
            <div style={{
              padding: "100px 0", textAlign: "center",
              color: G.textDim, fontSize: 14,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                border: `2px solid ${G.goldFaint}`,
                borderTopColor: G.gold,
                margin: "0 auto 16px",
                animation: "gobPulse 0.8s linear infinite",
              }} />
              Cargando datos...
            </div>
          )}

          {/* Grid de celulares */}
          {phones.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 32,
              alignItems: "start",
              animation: "fadeIn 0.5s ease",
              maxWidth: cols <= 2 ? 600 : "100%",
              margin: cols <= 2 ? "0 auto" : undefined,
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
              borderRadius: 20, padding: "60px 24px", textAlign: "center",
              animation: "fadeIn 0.4s ease",
            }}>
              <div style={{ fontSize: 40, opacity: 0.2, marginBottom: 16 }}>📵</div>
              <div style={{ fontSize: 15, color: G.textMid, fontWeight: 600 }}>
                Sin celulares registrados
              </div>
              <div style={{ fontSize: 12, color: G.textDim, marginTop: 8 }}>
                Registrá los celulares en Settings → Gestionar celulares WA.
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop: `1px solid ${G.border}`,
          padding: "14px 32px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: G.textDim, fontWeight: 600, letterSpacing: "0.3px" }}>
            GOBERNA · Plataforma de Operación Territorial
          </span>
          <span style={{ fontSize: 11, color: G.textDim }}>
            {lastAt ? `Actualizado: ${lastAt.toLocaleTimeString("es-PE")}` : "—"}
          </span>
        </div>
      </div>
    </>
  );
}
