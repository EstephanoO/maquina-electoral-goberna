"use client";

import { useState, useEffect, useCallback } from "react";

const FONT   = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;
const GREEN  = "#25d366";
const ORANGE = "#f59e0b";
const RED    = "#ef4444";
const BLUE   = "#60a5fa";
const BG     = "#0a0a0a";
const CARD   = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT   = "#e9edef";
const MUTED  = "rgba(255,255,255,0.45)";

type PhoneStats = { sent: number; failed: number; today: number; label: string };
type BlastStats = {
  ok: boolean;
  stats: {
    total_contacts: number; total_sent: number; total_pending: number;
    total_failed: number;   total_no_wa: number; total_responded: number;
    response_rate: number;  no_response_rate: number;
    quality_rating: "green" | "yellow" | "red"; can_scale: boolean;
  };
  by_number: Record<string, PhoneStats>;
};

const QUALITY_CONFIG = {
  green:  { label: "🟢 Verde — Zona premium",  color: GREEN,  hint: "Puedes escalar +20%/día" },
  yellow: { label: "🟡 Amarillo — Zona segura", color: ORANGE, hint: "Mantén el ritmo actual" },
  red:    { label: "🔴 Rojo — Zona de riesgo",  color: RED,    hint: "Reduce volumen inmediato" },
};

function SkeletonCard() {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ height: 12, width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 34, width: 100, background: "rgba(255,255,255,0.06)", borderRadius: 6 }} />
    </div>
  );
}

function KpiCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 22px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
      <p style={{ fontSize: 32, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{typeof value === "number" ? value.toLocaleString("es-PE") : value}</p>
      {sub && <p style={{ fontSize: 11, color: MUTED, margin: "6px 0 0" }}>{sub}</p>}
    </div>
  );
}

export default function BlastPage() {
  const [data, setData] = useState<BlastStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const refresh = useCallback(() => {
    fetch("/api/blast/stats", { credentials: "same-origin" })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j: BlastStats) => { if (!j.ok) throw new Error("Error"); setData(j); setError(null); setLastUpdated(new Date().toLocaleTimeString("es-PE")); })
      .catch(e => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 15_000); return () => clearInterval(id); }, [refresh]);

  const s = data?.stats;
  const pct = s && s.total_contacts > 0 ? Math.round((s.total_sent / s.total_contacts) * 100) : 0;
  const rrPct  = s ? Math.round(s.response_rate    * 100) : 0;
  const nrrPct = s ? Math.round(s.no_response_rate * 100) : 0;
  const qc     = s ? QUALITY_CONFIG[s.quality_rating] : null;
  const phones = data ? Object.entries(data.by_number).map(([num, v]) => ({ num, ...v })).sort((a,b) => b.today - a.today) : [];

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, color: TEXT }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 48px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Blast WhatsApp</h1>
            {lastUpdated && <p style={{ fontSize: 12, color: MUTED, margin: "4px 0 0" }}>Actualizado: {lastUpdated} · auto-refresh 15s</p>}
          </div>
          <button type="button" onClick={refresh} style={{ padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", background: GREEN, border: "none", borderRadius: 10, cursor: "pointer" }}>↻ Actualizar</button>
        </div>

        {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}><p style={{ color: "#f87171", fontSize: 13, fontWeight: 600, margin: 0 }}>Error: {error}</p></div>}

        {/* Quality Rating */}
        {s && qc && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>Quality Rating</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: qc.color, margin: 0 }}>{qc.label}</p>
              <p style={{ fontSize: 12, color: MUTED, margin: "3px 0 0" }}>{qc.hint}</p>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: rrPct >= 40 ? GREEN : rrPct >= 25 ? ORANGE : RED, margin: 0 }}>{rrPct}%</p>
                <p style={{ fontSize: 11, color: MUTED, margin: "3px 0 0" }}>Respuesta{rrPct >= 40 ? " ✅" : rrPct >= 25 ? " ⚠️" : " ❌"}</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: nrrPct <= 50 ? GREEN : nrrPct <= 70 ? ORANGE : RED, margin: 0 }}>{nrrPct}%</p>
                <p style={{ fontSize: 11, color: MUTED, margin: "3px 0 0" }}>Sin respuesta{nrrPct <= 50 ? " ✅" : nrrPct <= 70 ? " ⚠️" : " ❌"}</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: s.can_scale ? GREEN : ORANGE, margin: 0 }}>{s.can_scale ? "SÍ" : "NO"}</p>
                <p style={{ fontSize: 11, color: MUTED, margin: "3px 0 0" }}>¿Escalar?</p>
              </div>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
          {loading && !data ? [0,1,2,3,4].map(i => <SkeletonCard key={i} />) : s ? <>
            <KpiCard label="Total"      value={s.total_contacts} color={BLUE}   />
            <KpiCard label="Enviados"   value={s.total_sent}     color={GREEN}  sub={`${pct}% del total`} />
            <KpiCard label="Respondieron" value={s.total_responded} color="#a78bfa" sub={`${rrPct}% de enviados`} />
            <KpiCard label="Pendientes" value={s.total_pending}  color={ORANGE} />
            <KpiCard label="Sin WA"     value={s.total_no_wa}    color={MUTED}  />
          </> : null}
        </div>

        {/* Progress */}
        {s && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>Progreso global</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: GREEN, margin: 0 }}>{pct}%</p>
            </div>
            <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? GREEN : pct >= 50 ? BLUE : ORANGE, borderRadius: 999, transition: "width .5s ease" }} />
            </div>
            <p style={{ fontSize: 12, color: MUTED, margin: "8px 0 0" }}>{s.total_sent.toLocaleString("es-PE")} de {s.total_contacts.toLocaleString("es-PE")} enviados</p>
          </div>
        )}

        {/* Celulares */}
        {phones.length > 0 && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 22px", borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: 0 }}>Celulares ({phones.length})</p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {["Celular","Hoy","Total","Estado"].map(h => (
                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phones.map((p, i) => (
                  <tr key={p.num} style={{ borderBottom: i < phones.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                    <td style={{ padding: "12px 18px" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, margin: 0 }}>{p.label}</p>
                      <p style={{ fontSize: 11, color: MUTED, margin: "2px 0 0", fontFamily: "monospace" }}>{p.num}</p>
                    </td>
                    <td style={{ padding: "12px 18px", fontSize: 18, fontWeight: 800, color: p.today > 0 ? GREEN : MUTED }}>{p.today.toLocaleString("es-PE")}</td>
                    <td style={{ padding: "12px 18px", fontSize: 13, fontWeight: 600, color: TEXT }}>{p.sent.toLocaleString("es-PE")}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: p.today > 0 ? "rgba(37,211,102,0.12)" : "rgba(255,255,255,0.06)", color: p.today > 0 ? GREEN : MUTED, border: `1px solid ${p.today > 0 ? "rgba(37,211,102,0.25)" : BORDER}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.today > 0 ? GREEN : "rgba(255,255,255,0.2)", display: "inline-block" }} />
                        {p.today > 0 ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
