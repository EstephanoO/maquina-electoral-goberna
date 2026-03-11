/**
 * GOBERNA — Brigadista Panel (iOS style)
 * Right sidebar — brigadista feedback metrics, compact pill design.
 */

"use client";

import type { ValidationBrigadistaStats } from "@/lib/services/validacion";

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

type Props = {
  brigadistas: ValidationBrigadistaStats[];
  loading: boolean;
};

export function BrigadistaPanel({ brigadistas, loading }: Props) {
  const sorted = [...brigadistas].sort((a, b) => b.total - a.total);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", fontFamily: SF }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "0.5px solid rgba(60,60,67,.12)", flexShrink: 0, background: "rgba(249,249,249,.94)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1c1c1e", letterSpacing: "-0.3px" }}>Brigadistas</span>
        <span style={{ fontSize: 12, color: "#c7c7cc", marginLeft: 6 }}>{brigadistas.length}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {loading && <div style={{ padding: 32, textAlign: "center", color: "#c7c7cc", fontSize: 13 }}>Cargando...</div>}
        {!loading && sorted.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#c7c7cc", fontSize: 13 }}>Sin datos</div>}
        {sorted.map((b) => <BRow key={b.encuestador} b={b} />)}
      </div>
    </div>
  );
}

function BRow({ b }: { b: ValidationBrigadistaStats }) {
  const pct = b.tasa_validado * 100;
  const bar = pct >= 70 ? "#34c759" : pct >= 40 ? "#ff9500" : "#ff3b30";

  return (
    <div style={{ padding: "9px 14px", borderBottom: "0.5px solid rgba(60,60,67,.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1c1e", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.2px" }}>
          {b.encuestador || "?"}
        </span>
        <span style={{ fontSize: 11, color: "#8e8e93", fontFeatureSettings: '"tnum"' }}>{b.total}</span>
      </div>

      {/* Progress bar — iOS thin style */}
      <div style={{ height: 4, borderRadius: 2, background: "rgba(120,120,128,.12)", marginBottom: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: bar, width: `${Math.min(pct, 100)}%`, transition: "width .3s ease" }} />
      </div>

      {/* Stat pills */}
      <div style={{ display: "flex", gap: 5, fontSize: 10, flexWrap: "wrap" }}>
        <Pill label="D" value={b.voto_duro} color="#34c759" />
        <Pill label="B" value={b.voto_blando} color="#007aff" />
        <Pill label="F" value={b.voto_flotante} color="#af52de" />
        <Pill label="X" value={b.invalido} color="#ff3b30" />
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: bar, fontFeatureSettings: '"tnum"' }}>
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  if (!value) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 6px", borderRadius: 20, background: `${color}15`, color, fontWeight: 600, fontSize: 9, letterSpacing: "0.2px" }}>
      {label}{value}
    </span>
  );
}
