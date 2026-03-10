"use client";

import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  AreaChart, Area, CartesianGrid,
} from "recharts";
import type { ClassificationStats } from "@/lib/services/classification";

// ── Palette ────────────────────────────────────────────────────────
const G = {
  gold: "#FFC800",
  goldDim: "#CC9F00",
  goldFaint: "rgba(255,200,0,0.08)",
  goldBorder: "rgba(255,200,0,0.22)",
  surface: "#0c1a28",
  surfaceUp: "#0f2035",
  border: "rgba(255,255,255,0.06)",
  text: "#e9eef3",
  textMid: "#7a95aa",
  textDim: "#334d63",
  green: "#22c55e",
  red: "#ef5350",
  blue: "#3b82f6",
  orange: "#f59e0b",
  purple: "#a855f7",
  cyan: "#06b6d4",
} as const;

const VOTE_COLORS: Record<string, string> = {
  duro: "#22c55e",
  blando: "#f59e0b",
  flotante: "#a855f7",
  "": "#ef5350",
};

const VOTE_LABELS: Record<string, string> = {
  duro: "Duro",
  blando: "Blando",
  flotante: "Flotante",
  "": "Invalido",
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  pide_dinero: { label: "Pide Dinero", color: "#ef5350" },
  pide_trabajo: { label: "Pide Trabajo", color: "#f87171" },
  publicidad_pagada: { label: "Publicidad", color: "#fb923c" },
  sector_salud: { label: "Salud", color: "#22c55e" },
  pide_merch: { label: "Material", color: "#06b6d4" },
  coordinador: { label: "Coordinador", color: "#3b82f6" },
  apoyo_genuino: { label: "Apoyo", color: "#22d3ee" },
  apoyo_probable: { label: "Probable", color: "#67e8f9" },
  apoyo_condicional: { label: "Condicional", color: "#f59e0b" },
  indeciso: { label: "Indeciso", color: "#a855f7" },
  sector_salud_indeciso: { label: "Salud?", color: "#c084fc" },
  manual_override: { label: "Manual", color: "#CC9F00" },
  ai_classified: { label: "AI", color: "#818cf8" },
};

// ── Custom Tooltip ─────────────────────────────────────────────────
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{
      background: "rgba(12,26,40,0.95)", border: `1px solid ${G.goldBorder}`,
      borderRadius: 8, padding: "8px 14px", backdropFilter: "blur(8px)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: d.payload.fill || d.color || G.gold }}>
        {d.name || d.payload.name}
      </div>
      <div style={{ fontSize: 14, fontWeight: 900, color: G.text, marginTop: 2 }}>
        {d.value}
      </div>
    </div>
  );
}

// ── Donut Center Label ─────────────────────────────────────────────
function DonutCenter({ total, label }: { total: number; label: string }) {
  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={G.text}>
      <tspan x="50%" dy="-8" fontSize={26} fontWeight={900} fill={G.gold}>{total}</tspan>
      <tspan x="50%" dy="22" fontSize={10} fontWeight={700} fill={G.textMid}>{label}</tspan>
    </text>
  );
}

// ── Stat Mini ──────────────────────────────────────────────────────
function StatMini({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{
      padding: "14px 16px", background: G.surface, borderRadius: 12,
      border: `1px solid ${G.border}`, flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: G.textMid, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: "-0.5px", lineHeight: 1, marginTop: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: G.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Accuracy Gauge ─────────────────────────────────────────────────
function AccuracyRing({ rate }: { rate: number }) {
  const color = rate >= 90 ? G.green : rate >= 70 ? G.orange : G.red;
  const data = [
    { name: "Accuracy", value: rate, fill: color },
    { name: "Rest", value: 100 - rate, fill: "rgba(255,255,255,0.04)" },
  ];
  return (
    <div style={{ position: "relative", width: 100, height: 100 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius={32} outerRadius={44} startAngle={90} endAngle={-270}
            dataKey="value" stroke="none" animationDuration={800}>
            {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 18, fontWeight: 900, color }}>{rate}%</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: G.textDim, marginTop: 1 }}>PRECISION</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export function ClassificationMetrics({ stats }: { stats: ClassificationStats | null }) {
  // ── Pie data for vote class donut ─────────────────────────────
  const voteData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_vote_class)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([key, val]) => ({
        name: VOTE_LABELS[key] || key || "Sin clase",
        value: val,
        fill: VOTE_COLORS[key] || G.textMid,
      }));
  }, [stats]);

  // ── Bar data for categories ───────────────────────────────────
  const categoryData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_category)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([key, val]) => ({
        name: CATEGORY_CONFIG[key]?.label || key,
        value: val,
        fill: CATEGORY_CONFIG[key]?.color || G.textMid,
      }));
  }, [stats]);

  // ── Source split ──────────────────────────────────────────────
  const autoCount = stats?.by_source.auto || 0;
  const manualCount = stats?.by_source.manual || 0;
  const sourceData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Auto", value: autoCount, fill: G.cyan },
      { name: "Manual", value: manualCount, fill: G.gold },
    ].filter(d => d.value > 0);
  }, [stats, autoCount, manualCount]);

  if (!stats) {
    return (
      <div style={{
        padding: 60, textAlign: "center", color: G.textDim, fontSize: 13,
        background: G.surface, borderRadius: 12, border: `1px solid ${G.border}`,
      }}>
        Cargando metricas de clasificacion...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Row 1: KPI Cards ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatMini label="Total" value={stats.total} color={G.gold} />
        <StatMini label="Ultima Hora" value={stats.last_hour} color={G.green} />
        <StatMini label="24 Horas" value={stats.last_24h} color={G.blue} />
        <StatMini
          label="Correcciones"
          value={stats.corrections_count}
          color={G.orange}
          sub={`${autoCount + manualCount > 0 ? Math.round((autoCount / (autoCount + manualCount)) * 100) : 0}% automaticas`}
        />
        <StatMini
          label="Confianza"
          value={`${(stats.avg_confidence * 100).toFixed(0)}%`}
          color={G.cyan}
        />
      </div>

      {/* ── Row 2: Charts grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

        {/* Vote class donut */}
        <div style={{
          padding: "16px 12px", background: G.surface, borderRadius: 12,
          border: `1px solid ${G.border}`, display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: G.gold, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8, alignSelf: "flex-start" }}>
            Clasificacion de Voto
          </div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={voteData} innerRadius={55} outerRadius={80} dataKey="value"
                  stroke="rgba(6,14,24,0.8)" strokeWidth={2} animationDuration={800}
                  paddingAngle={2} label={false}>
                  {voteData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
                <DonutCenter total={stats.total} label="TOTAL" />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
            {voteData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: d.fill }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: G.textMid }}>{d.name}</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: d.fill }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category bar chart */}
        <div style={{
          padding: "16px 12px", background: G.surface, borderRadius: 12,
          border: `1px solid ${G.border}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: G.gold, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
            Por Categoria
          </div>
          {categoryData.length > 0 ? (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10, fill: G.textMid, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={600} barSize={16}>
                    {categoryData.map((d) => <Cell key={d.name} fill={d.fill} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: G.textDim, fontSize: 12 }}>
              Sin datos
            </div>
          )}
        </div>

        {/* Source split + Accuracy */}
        <div style={{
          padding: "16px 12px", background: G.surface, borderRadius: 12,
          border: `1px solid ${G.border}`, display: "flex", flexDirection: "column", gap: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: G.gold, textTransform: "uppercase", letterSpacing: "0.6px" }}>
            Fuente & Precision
          </div>

          {/* Accuracy gauge */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
            <AccuracyRing rate={stats.accuracy_rate} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: G.textMid, marginBottom: 4 }}>PRECISION AUTO</div>
              <div style={{ fontSize: 11, color: G.textDim }}>
                {stats.corrections_count} correcciones de {autoCount} auto
              </div>
            </div>
          </div>

          {/* Source donut */}
          {sourceData.length > 0 && (
            <div style={{ width: "100%", height: 110 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceData} innerRadius={30} outerRadius={45} dataKey="value"
                    stroke="rgba(6,14,24,0.8)" strokeWidth={2} animationDuration={600}
                    paddingAngle={3}>
                    {sourceData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Source legend */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: G.cyan }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: G.textMid }}>Auto</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: G.cyan }}>{autoCount}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: G.gold }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: G.textMid }}>Manual</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: G.gold }}>{manualCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
