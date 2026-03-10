"use client";

import type { ClassificationStats } from "@/lib/services/classification";

// ── Palette (Goberna dark navy + gold) ─────────────────────────────
const G = {
  gold: "#FFC800",
  goldDim: "#CC9F00",
  goldFaint: "rgba(255,200,0,0.08)",
  goldBorder: "rgba(255,200,0,0.22)",
  bg: "#060e18",
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

// ── Category display config ────────────────────────────────────────
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  pide_dinero: { label: "Pide Dinero", color: G.red },
  pide_trabajo: { label: "Pide Trabajo", color: "#f87171" },
  publicidad_pagada: { label: "Publicidad Pagada", color: "#fb923c" },
  sector_salud: { label: "Sector Salud", color: G.green },
  pide_merch: { label: "Pide Material", color: G.cyan },
  coordinador: { label: "Coordinador", color: G.blue },
  apoyo_genuino: { label: "Apoyo Genuino", color: "#22d3ee" },
  apoyo_probable: { label: "Apoyo Probable", color: "#67e8f9" },
  apoyo_condicional: { label: "Condicional", color: G.orange },
  indeciso: { label: "Indeciso", color: G.purple },
  sector_salud_indeciso: { label: "Salud Indeciso", color: "#c084fc" },
  manual_override: { label: "Manual", color: G.goldDim },
};

const VOTE_CLASS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  duro: { label: "DURO", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  blando: { label: "BLANDO", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  flotante: { label: "FLOTANTE", color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  "": { label: "INVALIDO", color: "#ef5350", bg: "rgba(239,83,80,0.12)" },
};

// ── StatCard ───────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      padding: "16px 20px",
      background: G.surface,
      border: `1px solid ${G.border}`,
      borderRadius: 12,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: G.textMid, textTransform: "uppercase", letterSpacing: "0.6px" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || G.gold, letterSpacing: "-1px", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: G.textDim, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

// ── BarChart (horizontal) ──────────────────────────────────────────
function HBar({ items, maxVal }: { items: { label: string; value: number; color: string }[]; maxVal: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map(({ label, value, color }) => {
        const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 100, fontSize: 11, fontWeight: 600, color: G.textMid, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </div>
            <div style={{ flex: 1, height: 18, borderRadius: 4, background: "rgba(255,255,255,0.04)", overflow: "hidden", position: "relative" }}>
              <div style={{
                height: "100%", width: `${pct}%`, borderRadius: 4,
                background: color, opacity: 0.85,
                transition: "width 0.5s ease",
              }} />
            </div>
            <div style={{ width: 36, fontSize: 12, fontWeight: 800, color, textAlign: "right", flexShrink: 0 }}>
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export function ClassificationMetrics({ stats }: { stats: ClassificationStats | null }) {
  if (!stats) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: G.textDim }}>
        Cargando metricas...
      </div>
    );
  }

  // Build category bar data
  const categoryItems = Object.entries(stats.by_category)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([key, val]) => ({
      label: CATEGORY_LABELS[key]?.label || key,
      value: val,
      color: CATEGORY_LABELS[key]?.color || G.textMid,
    }));
  const maxCategory = categoryItems[0]?.value ?? 1;

  // Build vote class bar data
  const voteItems = Object.entries(stats.by_vote_class)
    .sort(([, a], [, b]) => b - a)
    .map(([key, val]) => ({
      label: VOTE_CLASS_CONFIG[key]?.label || key || "SIN CLASE",
      value: val,
      color: VOTE_CLASS_CONFIG[key]?.color || G.textMid,
    }));
  const maxVote = voteItems[0]?.value ?? 1;

  // Source breakdown
  const autoCount = stats.by_source.auto || 0;
  const manualCount = stats.by_source.manual || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Row 1: Key metrics ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
      }}>
        <StatCard label="Total Clasificaciones" value={stats.total} />
        <StatCard label="Ultima Hora" value={stats.last_hour} color={G.green} />
        <StatCard label="Ultimas 24h" value={stats.last_24h} color={G.blue} />
        <StatCard
          label="Precision Auto"
          value={`${stats.accuracy_rate}%`}
          sub={`${stats.corrections_count} correcciones`}
          color={stats.accuracy_rate >= 90 ? G.green : stats.accuracy_rate >= 70 ? G.orange : G.red}
        />
        <StatCard
          label="Confianza Prom."
          value={`${(stats.avg_confidence * 100).toFixed(0)}%`}
          color={G.cyan}
        />
        <StatCard
          label="Auto / Manual"
          value={`${autoCount} / ${manualCount}`}
          sub={`${autoCount + manualCount > 0 ? Math.round((autoCount / (autoCount + manualCount)) * 100) : 0}% automaticas`}
          color={G.purple}
        />
      </div>

      {/* ── Row 2: Charts ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Categories breakdown */}
        <div style={{
          padding: 16, background: G.surface,
          border: `1px solid ${G.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: G.gold, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.6px" }}>
            Por Categoria
          </div>
          {categoryItems.length > 0 ? (
            <HBar items={categoryItems} maxVal={maxCategory} />
          ) : (
            <div style={{ fontSize: 12, color: G.textDim, textAlign: "center", padding: 20 }}>Sin datos</div>
          )}
        </div>

        {/* Vote class breakdown */}
        <div style={{
          padding: 16, background: G.surface,
          border: `1px solid ${G.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: G.gold, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.6px" }}>
            Por Clasificacion de Voto
          </div>
          {voteItems.length > 0 ? (
            <HBar items={voteItems} maxVal={maxVote} />
          ) : (
            <div style={{ fontSize: 12, color: G.textDim, textAlign: "center", padding: 20 }}>Sin datos</div>
          )}
        </div>
      </div>
    </div>
  );
}
