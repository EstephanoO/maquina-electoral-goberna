"use client";

import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import type { ClassificationStats } from "@/lib/services/classification";
import { MONITOR_THEME } from "./theme";

const VOTE_LABELS: Record<string, string> = {
  duro: "Duro",
  blando: "Blando",
  flotante: "Flotante",
  "": "Invalido",
};

const VOTE_ICONS: Record<string, string> = {
  Duro: "●",
  Blando: "◐",
  Flotante: "◌",
  Invalido: "×",
};

function themeIsDark(theme: { bg: string }) {
  return theme.bg === "#09121d";
}

// ── Custom Tooltip ─────────────────────────────────────────────────
function CustomTooltip({ active, payload, theme }: any) {
  const G = theme;
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const label = d.payload?.name || d.name;
  return (
    <div style={{
      background: G.surface, border: `1px solid ${G.borderStrong}`,
      borderRadius: 16, padding: "10px 14px", boxShadow: "none",
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: d.payload.fill || d.color || G.brandBlue }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, color: G.text, marginTop: 2 }}>
        {d.value}
      </div>
    </div>
  );
}

// ── Donut Center Label ─────────────────────────────────────────────
function DonutCenter({ total, label, theme }: { total: number; label: string; theme: typeof MONITOR_THEME }) {
  const G = theme;
  return (
    <text x="50%" y="84%" textAnchor="middle" dominantBaseline="central" fill={G.text}>
      <tspan x="50%" dy="0" fontSize={28} fontWeight={900} fill={G.brandBlue}>{total}</tspan>
      <tspan x="50%" dy="16" fontSize={10} fontWeight={700} fill={G.textMid}>{label}</tspan>
    </text>
  );
}

// ── Accuracy Gauge ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export function ClassificationMetrics({ stats }: { stats: ClassificationStats | null }) {
  const G = MONITOR_THEME;
  const VOTE_COLORS: Record<string, string> = {
    duro: G.green,
    blando: G.orange,
    flotante: G.purple,
    "": G.red,
  };
  const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
    pide_dinero: { label: "Pide Dinero", color: G.red },
    pide_trabajo: { label: "Pide Trabajo", color: themeIsDark(G) ? "#ff9b94" : "#d96b5f" },
    publicidad_pagada: { label: "Publicidad", color: G.orange },
    sector_salud: { label: "Salud", color: G.green },
    pide_merch: { label: "Material", color: G.teal },
    coordinador: { label: "Coordinador", color: G.brandBlue },
    apoyo_genuino: { label: "Apoyo", color: G.sky },
    apoyo_probable: { label: "Probable", color: themeIsDark(G) ? "#95c3f0" : "#7a9abd" },
    apoyo_condicional: { label: "Condicional", color: themeIsDark(G) ? "#ffc36a" : "#d8a73c" },
    indeciso: { label: "Indeciso", color: G.purple },
    sector_salud_indeciso: { label: "Salud?", color: themeIsDark(G) ? "#c8b7ff" : "#9f8fca" },
    manual_override: { label: "Manual", color: G.brandGold },
    ai_classified: { label: "IA", color: G.brandBlueSoft },
    unknown: { label: "Sin categoria", color: G.textDim },
  };
  // ── Pie data for vote class donut ─────────────────────────────
  const voteData = !stats
    ? []
    : Object.entries(stats.by_vote_class)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([key, val]) => ({
          name: VOTE_LABELS[key] || key || "Sin clase",
          value: val,
          fill: VOTE_COLORS[key] || G.textMid,
        }));

  // ── Bar data for categories ───────────────────────────────────
  const categoryData = !stats
    ? []
    : Object.entries(stats.by_category)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([key, val]) => ({
          name: CATEGORY_CONFIG[key]?.label || key.replaceAll("_", " "),
          value: val,
          fill: CATEGORY_CONFIG[key]?.color || G.textMid,
        }));

  if (!stats) {
    return (
      <div style={{
        padding: 60, textAlign: "center", color: G.textDim, fontSize: 13,
        background: G.surface, borderRadius: 16, border: `1px solid ${G.border}`,
      }}>
        Cargando metricas de clasificacion...
      </div>
    );
  }

  return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>

        {/* Vote class donut */}
        <div style={{
          padding: "2px 18px 18px", background: G.surface, borderRadius: 24,
          border: `1px solid ${G.borderStrong}`, boxShadow: "none", display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: G.textMid, textTransform: "uppercase", letterSpacing: "3px", marginBottom: 0, alignSelf: "flex-start" }}>
            Clasificacion de Voto
          </div>
          <div style={{ width: "100%", height: 320, marginTop: -42 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                  <Pie data={voteData} innerRadius={108} outerRadius={154} dataKey="value"
                  startAngle={180} endAngle={0}
                  cy="92%"
                  stroke={G.bg} strokeWidth={2} animationDuration={800}
                  paddingAngle={3} cornerRadius={8} label={false}>
                  {voteData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                 </Pie>
                  <DonutCenter total={stats.total} label="TOTAL" theme={G} />
                 <Tooltip content={<CustomTooltip theme={G} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
            {voteData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 12, color: d.fill, lineHeight: 1 }}>{VOTE_ICONS[d.name] ?? "●"}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: G.textMid }}>{d.name}</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: d.fill }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category bar chart */}
        <div style={{
          padding: "18px 18px", background: G.surface, borderRadius: 24,
          border: `1px solid ${G.borderStrong}`, boxShadow: "none",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: G.textMid, textTransform: "uppercase", letterSpacing: "3px", marginBottom: 12 }}>
            Por Categoria
          </div>
          {categoryData.length > 0 ? (
          <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: G.textMid, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip theme={G} />} cursor={{ fill: G.surfaceSoft }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={600} barSize={22}>
                    {categoryData.map((d) => <Cell key={d.name} fill={d.fill} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: G.textDim, fontSize: 12 }}>
              Sin datos
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
