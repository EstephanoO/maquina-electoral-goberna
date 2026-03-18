"use client";

import { useState, useEffect } from "react";

const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;
const GREEN = "#25d366";
const ORANGE = "#f59e0b";
const BG = "#0a0a0a";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#e9edef";
const MUTED = "rgba(255,255,255,0.45)";

type PhoneStats = { sent: number; failed: number; today: number; label: string };

type BlastStats = {
  stats: {
    total_contacts: number;
    total_sent: number;
    total_pending: number;
    total_failed: number;
    total_no_wa: number;
  };
  by_number: Record<string, PhoneStats>;
};

function SkeletonCard() {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ height: 14, width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 36, width: 100, background: "rgba(255,255,255,0.06)", borderRadius: 6 }} />
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: MUTED, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
      <p style={{ fontSize: 36, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value.toLocaleString("es-PE")}</p>
    </div>
  );
}

export default function BlastPage() {
  const [data, setData] = useState<BlastStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  function refresh() {
    setLoading(true);
    fetch("/api/blast/stats", { credentials: "same-origin" })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((json: BlastStats & { ok: boolean; message?: string }) => {
        if (!json.ok) throw new Error(json.message ?? "Error desconocido");
        setData(json);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString("es-PE"));
      })
      .catch(e => setError(e instanceof Error ? e.message : "Error al cargar datos"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phones = data
    ? Object.entries(data.by_number)
        .map(([num, s]) => ({ num, ...s }))
        .sort((a, b) => b.today - a.today)
    : [];

  const pct =
    data && data.stats.total_contacts > 0
      ? Math.round((data.stats.total_sent / data.stats.total_contacts) * 100)
      : 0;

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, color: TEXT }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 48px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Blast WhatsApp</h1>
            {lastUpdated && (
              <p style={{ fontSize: 12, color: MUTED, margin: "4px 0 0" }}>
                Actualizado: {lastUpdated} · auto-refresh cada 15s
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={refresh}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
              fontSize: 13, fontWeight: 700, color: "#fff", background: GREEN,
              border: "none", borderRadius: 10, cursor: "pointer", fontFamily: FONT,
            }}
          >
            Actualizar
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 24 }}>
            <p style={{ color: "#f87171", fontSize: 13, fontWeight: 600, margin: 0 }}>Error: {error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          {loading && !data ? (
            <>{[0,1,2,3].map(i => <SkeletonCard key={i} />)}</>
          ) : data ? (
            <>
              <KpiCard label="Total contactos" value={data.stats.total_contacts} color="#60a5fa" />
              <KpiCard label="Enviados"         value={data.stats.total_sent}      color={GREEN} />
              <KpiCard label="Pendientes"        value={data.stats.total_pending}   color={ORANGE} />
              <KpiCard label="Sin WhatsApp"      value={data.stats.total_no_wa}     color="rgba(255,255,255,0.4)" />
            </>
          ) : null}
        </div>

        {/* Progress Bar */}
        {data && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: 0 }}>Progreso global</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: GREEN, margin: 0 }}>{pct}%</p>
            </div>
            <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: GREEN, borderRadius: 999, transition: "width 0.5s ease" }} />
            </div>
            <p style={{ fontSize: 12, color: MUTED, margin: "8px 0 0" }}>
              {data.stats.total_sent.toLocaleString("es-PE")} de {data.stats.total_contacts.toLocaleString("es-PE")} contactos enviados
            </p>
          </div>
        )}

        {/* Table */}
        {data && phones.length > 0 && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: TEXT, margin: 0 }}>Celulares</p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {["Celular", "Enviados hoy", "Total enviados", "Estado"].map(h => (
                    <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {phones.map((p, i) => (
                  <tr key={p.num} style={{ borderBottom: i < phones.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                    <td style={{ padding: "14px 20px" }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: 0 }}>{p.label}</p>
                      <p style={{ fontSize: 11, color: MUTED, margin: "2px 0 0", fontFamily: "monospace" }}>{p.num}</p>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 18, fontWeight: 700, color: p.today > 0 ? GREEN : MUTED }}>{p.today.toLocaleString("es-PE")}</td>
                    <td style={{ padding: "14px 20px", fontSize: 14, fontWeight: 600, color: TEXT }}>{p.sent.toLocaleString("es-PE")}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
                        borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: p.today > 0 ? "rgba(37,211,102,0.12)" : "rgba(255,255,255,0.06)",
                        color: p.today > 0 ? GREEN : MUTED,
                        border: `1px solid ${p.today > 0 ? "rgba(37,211,102,0.25)" : BORDER}`,
                      }}>
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
