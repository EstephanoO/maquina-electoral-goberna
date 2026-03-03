"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CampaignStats } from "@/lib/types";
import type { MapTheme } from "./types";

/* ========== Types ========== */

export type TierraViewMode = "campo" | "pipeline" | "datos";

type Props = {
  stats: CampaignStats;
  agentCount: number;
  formCount: number;
  connectedCount: number;
  mapTheme: MapTheme;
  viewMode: TierraViewMode;
  onViewModeChange: (mode: TierraViewMode) => void;
};

/* ========== Component ========== */

export function TierraHeader({ stats, agentCount, formCount, connectedCount, mapTheme, viewMode, onViewModeChange }: Props) {
  const router = useRouter();
  const { campaign, metas, totals } = stats;
  const pc = campaign.color_primario;
  const sc = campaign.color_secundario;
  const isDark = mapTheme === "dark";

  const metaDatos = metas.datos > 0 ? metas.datos : 200000;
  const datosProgress = Math.min((totals.forms_count / metaDatos) * 100, 100);
  const votosProgress = metas.votos > 0 ? Math.min((totals.forms_count / metas.votos) * 100, 100) : 0;

  return (
    <header className={`flex items-center justify-between h-16 px-5 border-b shrink-0 gap-5 z-20 ${
      isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200/80"
    }`}>
      {/* Left: back + candidate identity */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => router.back()}
          className={`w-8 h-8 rounded-lg border cursor-pointer flex items-center justify-center shrink-0 transition-colors ${
            isDark
              ? "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          }`}
          aria-label="Volver"
          title="Volver"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Volver</title><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className="w-9 h-9 rounded-full overflow-hidden border-2 shrink-0" style={{ borderColor: sc || pc }}>
          {campaign.foto_url ? (
            <Image src={campaign.foto_url} alt="" width={36} height={36} className="w-full h-full object-cover" unoptimized />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-white text-xs font-extrabold" style={{ backgroundColor: pc }}>
              {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className={`text-sm font-bold whitespace-nowrap overflow-hidden text-ellipsis ${isDark ? "text-slate-100" : "text-slate-900"}`}>{campaign.name}</div>
          <div className="flex gap-2 text-[11px] text-slate-400">
            {campaign.cargo && <span>{campaign.cargo}</span>}
            {campaign.numero && <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-500"}`}>N.° {campaign.numero}</span>}
            {campaign.partido && <span className="italic">{campaign.partido}</span>}
          </div>
        </div>
      </div>

      {/* Center: segmented control + KPIs */}
      <div className="flex items-center gap-5">
        {/* Segmented control — pill style */}
        <div className={`flex rounded-full p-0.5 ${isDark ? "bg-slate-900/95 border border-slate-700" : "bg-slate-100"}`}>
          <SegmentButton
            active={viewMode === "campo"}
            onClick={() => onViewModeChange("campo")}
            icon={<MapPinIcon />}
            label="Campo"
            activeColor={pc}
            mapTheme={mapTheme}
          />
          <SegmentButton
            active={viewMode === "pipeline"}
            onClick={() => onViewModeChange("pipeline")}
            icon={<ChartBarIcon />}
            label="Pipeline"
            activeColor={pc}
            mapTheme={mapTheme}
          />
          <SegmentButton
            active={viewMode === "datos"}
            onClick={() => onViewModeChange("datos")}
            icon={<TableIcon />}
            label="Datos"
            activeColor={pc}
            mapTheme={mapTheme}
          />
        </div>

        {/* Contextual KPIs — only for Campo and Datos mode; Pipeline has the hero card */}
        {viewMode !== "pipeline" && (
          <>
            <div className={`w-px h-8 ${isDark ? "bg-slate-700/80" : "bg-slate-200/70"}`} />
            <CampoKpis formCount={formCount} agentCount={agentCount} connectedCount={connectedCount} todayCount={totals.forms_today} primaryColor={pc} mapTheme={mapTheme} />
          </>
        )}
      </div>

      {/* Right: metas (both modes) */}
      <div className="flex gap-4 shrink-0">
        <MetaBar label="Meta datos" current={totals.forms_count} target={metaDatos} pct={datosProgress} color={pc} mapTheme={mapTheme} />
        <MetaBar label="Meta votos" current={null} target={metas.votos} pct={votosProgress} color={sc || pc} mapTheme={mapTheme} />
      </div>
    </header>
  );
}

/* ========== Segmented Control Button ========== */

function SegmentButton({ active, onClick, icon, label, activeColor, mapTheme }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
  mapTheme: MapTheme;
}) {
  const isDark = mapTheme === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all duration-200 cursor-pointer border-none ${
        active
          ? "text-white shadow-sm"
          : (isDark ? "text-slate-300 hover:text-white" : "text-slate-500 hover:text-slate-700")
      }`}
      style={active ? { backgroundColor: activeColor } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

/* ========== KPI Groups ========== */

function CampoKpis({ formCount, agentCount, connectedCount, todayCount, primaryColor, mapTheme }: {
  formCount: number;
  agentCount: number;
  connectedCount: number;
  todayCount: number;
  primaryColor: string;
  mapTheme: MapTheme;
}) {
  return (
    <div className="flex items-center gap-4">
      <KpiSlot value={formCount.toLocaleString()} label="Puntos" mapTheme={mapTheme} />
      <KpiDivider mapTheme={mapTheme} />
      <KpiSlot value={String(agentCount)} label="Agentes" mapTheme={mapTheme} />
      <KpiDivider mapTheme={mapTheme} />
      <KpiSlot value={String(connectedCount)} label="En linea" className={connectedCount > 0 ? "text-teal-500" : "text-slate-400"} mapTheme={mapTheme} />
      <KpiDivider mapTheme={mapTheme} />
      <KpiSlot value={`+${todayCount}`} label="Hoy" style={{ color: primaryColor }} mapTheme={mapTheme} />
    </div>
  );
}



/* ========== Sub-components ========== */

function KpiSlot({ value, label, className, style, mapTheme }: {
  value: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
  mapTheme: MapTheme;
}) {
  const isDark = mapTheme === "dark";
  return (
    <div className="flex flex-col items-center">
      <span className={`text-[20px] font-black leading-tight tabular-nums ${className ?? (isDark ? "text-slate-100" : "text-slate-800")}`} style={style}>{value}</span>
      <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>{label}</span>
    </div>
  );
}

function KpiDivider({ mapTheme }: { mapTheme: MapTheme }) {
  return <div className={`w-px h-8 ${mapTheme === "dark" ? "bg-slate-700/80" : "bg-slate-100"}`} />;
}

function MetaBar({ label, current, target, pct, color, mapTheme }: {
  label: string;
  current: number | null;
  target: number;
  pct: number;
  color: string;
  mapTheme: MapTheme;
}) {
  const isDark = mapTheme === "dark";
  return (
    <div className="min-w-[140px] py-1">
      <div className="flex justify-between items-center mb-1">
        <span className={`text-[9px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-400"}`}>{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{target > 0 ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
        <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1 text-[11px]">
        <span className={`font-bold ${isDark ? "text-slate-100" : "text-slate-700"}`}>{current !== null ? current.toLocaleString() : "—"}</span>
        <span className={isDark ? "text-slate-500" : "text-slate-300"}> / {target > 0 ? target.toLocaleString() : "—"}</span>
      </div>
    </div>
  );
}

/* ========== Icons ========== */

function MapPinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ChartBarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
