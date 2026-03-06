"use client";

/**
 * GOBERNA — Monitor WA (candidato-scoped)
 * War-room: siempre muestra los 6 celulares Vásquez 1–6.
 * Integrado en el tab bar del candidato — sin header/footer propios.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Iphone } from "@/components/magicui/iphone";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
  type ExtensionMonitorOperator,
} from "@/lib/services/cms";

// ── Paleta ────────────────────────────────────────────────────────────
const G = {
  gold:       "#FFC800",
  goldDim:    "#CC9F00",
  goldFaint:  "rgba(255,200,0,0.10)",
  goldBorder: "rgba(255,200,0,0.25)",
  navyDark:   "#0e2640",
  bg:         "#060e18",
  surface:    "#0c1a28",
  surfaceUp:  "#0f2035",
  border:     "rgba(255,255,255,0.06)",
  text:       "#e9eef3",
  textMid:    "#7a95aa",
  textDim:    "#334d63",
  green:      "#22c55e",
} as const;

// ── Los 6 slots fijos ─────────────────────────────────────────────────
const SLOTS = ["Vásquez 1", "Vásquez 2", "Vásquez 3", "Vásquez 4", "Vásquez 5", "Vásquez 6"];

const EMPTY_PHONE: ExtensionMonitorPhone = {
  own_number: "",
  alias: null,
  wa_sent: 0,
  unique_contacts: 0,
  last_event_at: null,
  operators: [],
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif";

// ── Helpers ───────────────────────────────────────────────────────────
function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

// ── OperatorRow ───────────────────────────────────────────────────────
function OperatorRow({ op, maxSent }: { op: ExtensionMonitorOperator; maxSent: number }) {
  const pct  = maxSent > 0 ? (op.wa_sent / maxSent) * 100 : 0;
  const name = op.full_name.split(" ")[0] ?? op.email.split("@")[0];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "6px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        background: "rgba(255,200,0,0.12)",
        border: "1.5px solid rgba(255,200,0,0.30)",
        color: G.gold,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 900,
      }}>
        {(op.full_name[0] ?? "?").toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: G.text,
          marginBottom: 3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {name}
        </div>
        <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 2,
            background: "linear-gradient(90deg,#FFC800,#FFE066)",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>
      <span style={{
        flexShrink: 0, minWidth: 20, textAlign: "right",
        fontSize: 14, fontWeight: 900, color: G.gold,
      }}>
        {op.wa_sent}
      </span>
    </div>
  );
}

// ── PhoneScreen ───────────────────────────────────────────────────────
function PhoneScreen({ phone, slotName }: { phone: ExtensionMonitorPhone; slotName: string }) {
  const active    = phone.wa_sent > 0;
  const activeOps = [...phone.operators]
    .filter(o => o.wa_sent > 0)
    .sort((a, b) => b.wa_sent - a.wa_sent);
  const maxOp = activeOps[0]?.wa_sent ?? 0;

  return (
    <div style={{
      width: "100%", height: "100%",
      background: active
        ? "linear-gradient(175deg,#0f1d2f 0%,#091422 60%,#050c15 100%)"
        : "linear-gradient(175deg,#0a1420 0%,#060d18 60%,#030810 100%)",
      display: "flex", flexDirection: "column",
      fontFamily: FONT,
      overflow: "hidden",
    }}>
      {/* Status bar */}
      <div style={{
        height: "7%", flexShrink: 0,
        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
        padding: "0 10% 5px",
      }}>
        {active && (
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: G.gold, boxShadow: `0 0 8px ${G.gold}`,
            animation: "gobPulse 2.5s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: "5% 9% 4%", gap: "4%", overflow: "hidden",
      }}>
        {/* Nombre del slot */}
        <div style={{
          fontSize: "clamp(12px,4.5%,17px)", fontWeight: 900,
          color: active ? G.gold : G.textDim,
          letterSpacing: "-0.2px", lineHeight: 1.1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {slotName}
        </div>

        {active ? (
          <>
            {/* Métricas grandes */}
            <div style={{ display: "flex", gap: "4%" }}>
              {[
                { v: phone.wa_sent,         l: "Enviados" },
                { v: phone.unique_contacts, l: "Contactos" },
              ].map(({ v, l }) => (
                <div key={l} style={{
                  flex: 1, padding: "10% 0",
                  background: "rgba(255,200,0,0.07)",
                  borderRadius: "12%",
                  border: "1px solid rgba(255,200,0,0.18)",
                  display: "flex", flexDirection: "column", alignItems: "center",
                }}>
                  <span style={{
                    fontSize: "clamp(18px,7.5%,30px)", fontWeight: 900, lineHeight: 1,
                    color: G.gold, letterSpacing: "-1px",
                  }}>
                    {v}
                  </span>
                  <span style={{
                    fontSize: "clamp(8px,2.8%,11px)", fontWeight: 700,
                    color: G.goldDim, marginTop: "12%", letterSpacing: "0.4px",
                  }}>
                    {l}
                  </span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{
              height: 1,
              background: "linear-gradient(90deg,transparent,rgba(255,200,0,0.18),transparent)",
            }} />

            {/* Operadoras */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {activeOps.slice(0, 6).map(op => (
                <OperatorRow key={op.operator_id} op={op} maxSent={maxOp} />
              ))}
            </div>

            {/* Último evento */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: "3%", borderTop: "1px solid rgba(255,255,255,0.05)",
            }}>
              <span style={{ fontSize: "clamp(8px,2.8%,11px)", color: G.textDim }}>Último</span>
              <span style={{ fontSize: "clamp(8px,2.8%,11px)", fontWeight: 700, color: "rgba(255,200,0,0.55)" }}>
                {formatRelative(phone.last_event_at)}
              </span>
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "8%",
          }}>
            <div style={{ fontSize: "clamp(26px,10%,40px)", opacity: 0.07 }}>💬</div>
            <div style={{ fontSize: "clamp(9px,3.2%,12px)", color: G.textDim, textAlign: "center" }}>
              En espera
            </div>
          </div>
        )}
      </div>

      {/* Home indicator */}
      <div style={{
        height: "4%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: "30%", height: 3, borderRadius: 2,
          background: active ? "rgba(255,200,0,0.18)" : "rgba(255,255,255,0.06)",
        }} />
      </div>
    </div>
  );
}

// ── PhoneCard ─────────────────────────────────────────────────────────
function PhoneCard({ phone, slotName }: { phone: ExtensionMonitorPhone; slotName: string }) {
  const active = phone.wa_sent > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{
        width: "100%",
        filter: active
          ? "drop-shadow(0 0 22px rgba(255,200,0,0.28)) drop-shadow(0 12px 40px rgba(0,0,0,0.8))"
          : "drop-shadow(0 6px 24px rgba(0,0,0,0.65))",
        transition: "filter 0.5s ease",
      }}>
        <Iphone frameColor="#000000" screenColor={active ? "#0f1d2f" : "#0a1420"}>
          <PhoneScreen phone={phone} slotName={slotName} />
        </Iphone>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 12, fontWeight: 800, letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: active ? G.gold : G.textDim,
        }}>
          {slotName}
        </div>
        <div style={{
          marginTop: 5, fontSize: 10, fontWeight: 700, letterSpacing: "1.2px",
          color: active ? G.green : G.textDim,
        }}>
          {active ? "● ACTIVO" : "○ EN ESPERA"}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function MonitorWaPage() {
  const { campaigns } = useAuth();
  const params = useParams();
  const slug = params.slug as string;

  const campaign   = campaigns.find((c) => c.slug === slug);
  const campaignId = campaign?.id ?? null;

  const [phones, setPhones]   = useState<ExtensionMonitorPhone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [lastAt, setLastAt]   = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true); setError(null);
    const r = await getExtensionMonitor(campaignId);
    setLoading(false);
    if (!r.ok) { setError(r.error ?? "Error cargando datos"); return; }
    setPhones(r.phones ?? []);
    setLastAt(new Date());
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Siempre 5 slots — merge por alias
  const slots = SLOTS.map(slotName => {
    const match = phones.find(p =>
      (p.alias ?? "").toLowerCase().trim() === slotName.toLowerCase().trim()
    );
    return { slotName, phone: match ?? { ...EMPTY_PHONE, alias: slotName } };
  });

  const activeCount = slots.filter(s => s.phone.wa_sent > 0).length;
  const totalSent   = slots.reduce((sum, s) => sum + s.phone.wa_sent, 0);

  // ── No campaign yet ──
  if (!campaignId) {
    return (
      <div style={{
        minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: G.bg, color: G.textDim, fontFamily: FONT, fontSize: 14,
      }}>
        Cargando campaña…
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes gobPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(0.7); }
        }
        * { box-sizing:border-box; }
      `}</style>

      <div style={{
        minHeight: "calc(100vh - 96px)",
        background: `radial-gradient(ellipse 90% 40% at 50% -5%, rgba(22,57,96,0.28) 0%, transparent 65%), ${G.bg}`,
        color: G.text, fontFamily: FONT,
      }}>

        {/* ── Sub-header ── */}
        <div style={{
          background: "rgba(9,22,38,0.94)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,200,0,0.14)",
          padding: "0 28px",
          position: "sticky", top: 48, zIndex: 40,
        }}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            height: 52, gap: 16,
          }}>
            {/* Totales */}
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: G.gold, letterSpacing: "-0.5px", lineHeight: 1 }}>
                  {totalSent}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: G.goldDim, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 2 }}>
                  Enviados
                </div>
              </div>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: G.text, letterSpacing: "-0.5px", lineHeight: 1 }}>
                  {activeCount}<span style={{ fontSize: 13, color: G.textMid, fontWeight: 600 }}>/6</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: G.textMid, textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 2 }}>
                  Activos
                </div>
              </div>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: activeCount > 0 ? G.green : G.textDim,
                  boxShadow: activeCount > 0 ? `0 0 6px ${G.green}` : "none",
                  animation: activeCount > 0 ? "gobPulse 2.5s ease-in-out infinite" : "none",
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: activeCount > 0 ? G.green : G.textDim }}>
                  {activeCount > 0 ? "EN VIVO" : "ESPERANDO"}
                </span>
              </div>
            </div>

            {/* Derecha */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {lastAt && (
                <span style={{ fontSize: 11, color: G.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {lastAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <button
                type="button" onClick={load} disabled={loading}
                style={{
                  padding: "6px 14px", borderRadius: 7,
                  border: `1px solid ${loading ? "rgba(255,200,0,0.12)" : G.goldBorder}`,
                  background: loading ? "transparent" : G.goldFaint,
                  color: loading ? G.textDim : G.gold,
                  fontSize: 12, cursor: loading ? "default" : "pointer",
                  fontWeight: 800, transition: "all 0.2s",
                }}
              >
                {loading ? "···" : "↻ Actualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            margin: "16px 28px 0",
            background: "rgba(239,83,80,0.07)", border: "1px solid rgba(239,83,80,0.22)",
            borderRadius: 10, padding: "10px 16px",
            fontSize: 13, color: "#ef5350",
          }}>
            ⚠ {error}
          </div>
        )}

        {/* ── 6 celulares: 3+3 ── */}
        <div style={{
          padding: "28px 24px 48px",
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: "24px 20px",
          alignItems: "start",
          maxWidth: 1200,
          margin: "0 auto",
        }}>
          {slots.map(({ slotName, phone }) => (
            <PhoneCard key={slotName} phone={phone} slotName={slotName} />
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop: `1px solid ${G.border}`,
          padding: "12px 28px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: G.textDim, fontWeight: 600 }}>
            Monitor WA · Auto-refresh 30 s
          </span>
          <span style={{ fontSize: 11, color: G.textDim }}>
            {lastAt ? `Actualizado: ${lastAt.toLocaleTimeString("es-PE")}` : "—"}
          </span>
        </div>
      </div>
    </>
  );
}
