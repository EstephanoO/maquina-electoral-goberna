"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CampaignStats } from "@/lib/types";
import type { ScreenTier } from "./hooks/use-breakpoint";

/* ========== Types ========== */

export type TierraViewMode = "campo" | "pipeline" | "datos";

type Props = {
  stats: CampaignStats;
  agentCount: number;
  formCount: number;
  connectedCount: number;
  viewMode: TierraViewMode;
  onViewModeChange: (mode: TierraViewMode) => void;
  tier: ScreenTier;
};

/* ========== Component ========== */

export function TierraHeader({ stats, agentCount, formCount, connectedCount, viewMode, onViewModeChange, tier }: Props) {
  const router = useRouter();
  const { campaign, metas, totals } = stats;
  const pc = campaign.color_primario;
  const sc = campaign.color_secundario;

  const isMobile = tier === "mobile";
  const isTV = tier === "tv";

  const metaDatos = metas.datos > 0 ? metas.datos : 200000;
  const datosProgress = Math.min((totals.forms_count / metaDatos) * 100, 100);
  const votosProgress = metas.votos > 0 ? Math.min((totals.forms_count / metas.votos) * 100, 100) : 0;

  /* ── Mobile: compact header — back + avatar + icon-only pills ── */
  if (isMobile) {
    return (
      <header className="flex items-center h-12 px-3 bg-white border-b border-slate-200/80 shrink-0 gap-2 z-20">
        <button type="button" onClick={() => router.back()} className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 cursor-pointer flex items-center justify-center shrink-0" aria-label="Volver" title="Volver">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Volver</title><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="w-7 h-7 rounded-full overflow-hidden border-2 shrink-0" style={{ borderColor: sc || pc }}>
          {campaign.foto_url ? (
            <Image src={campaign.foto_url} alt="" width={28} height={28} className="w-full h-full object-cover" unoptimized />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-white text-[9px] font-extrabold" style={{ backgroundColor: pc }}>
              {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>
        <div className="flex rounded-full bg-slate-100 p-0.5 ml-auto">
          <SegmentButton active={viewMode === "campo"} onClick={() => onViewModeChange("campo")} icon={<MapPinIcon />} activeColor={pc} />
          <SegmentButton active={viewMode === "pipeline"} onClick={() => onViewModeChange("pipeline")} icon={<ChartBarIcon />} activeColor={pc} />
          <SegmentButton active={viewMode === "datos"} onClick={() => onViewModeChange("datos")} icon={<TableIcon />} activeColor={pc} />
        </div>
      </header>
    );
  }

  /* ── Desktop / TV ── */
  return (
    <header className={`flex items-center justify-between bg-white border-b border-slate-200/80 shrink-0 z-20 ${isTV ? "h-20 px-7 gap-7" : "h-16 px-5 gap-5"}`}>
      {/* Left: back + candidate identity */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => router.back()}
          className={`rounded-lg border border-slate-200 bg-slate-50 text-slate-400 cursor-pointer flex items-center justify-center shrink-0 hover:bg-slate-100 hover:text-slate-600 transition-colors ${isTV ? "w-10 h-10" : "w-8 h-8"}`}
          aria-label="Volver"
          title="Volver"
        >
          <svg width={isTV ? 18 : 15} height={isTV ? 18 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Volver</title><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className={`rounded-full overflow-hidden border-2 shrink-0 ${isTV ? "w-12 h-12" : "w-9 h-9"}`} style={{ borderColor: sc || pc }}>
          {campaign.foto_url ? (
            <Image src={campaign.foto_url} alt="" width={isTV ? 48 : 36} height={isTV ? 48 : 36} className="w-full h-full object-cover" unoptimized />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-white text-xs font-extrabold" style={{ backgroundColor: pc }}>
              {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className={`font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis ${isTV ? "text-base" : "text-sm"}`}>{campaign.name}</div>
          <div className={`flex gap-2 text-slate-400 ${isTV ? "text-xs" : "text-[11px]"}`}>
            {campaign.cargo && <span>{campaign.cargo}</span>}
            {campaign.numero && <span className="font-semibold text-slate-500">N.° {campaign.numero}</span>}
            {campaign.partido && <span className="italic">{campaign.partido}</span>}
          </div>
        </div>
      </div>

      {/* Center: segmented control + KPIs */}
      <div className={`flex items-center ${isTV ? "gap-7" : "gap-5"}`}>
        <div className="flex rounded-full bg-slate-100 p-0.5">
          <SegmentButton active={viewMode === "campo"} onClick={() => onViewModeChange("campo")} icon={<MapPinIcon />} label="Campo" activeColor={pc} isTV={isTV} />
          <SegmentButton active={viewMode === "pipeline"} onClick={() => onViewModeChange("pipeline")} icon={<ChartBarIcon />} label="Pipeline" activeColor={pc} isTV={isTV} />
          <SegmentButton active={viewMode === "datos"} onClick={() => onViewModeChange("datos")} icon={<TableIcon />} label="Datos" activeColor={pc} isTV={isTV} />
        </div>

        {viewMode !== "pipeline" && (
          <>
            <div className={`w-px bg-slate-200/70 ${isTV ? "h-10" : "h-8"}`} />
            <CampoKpis formCount={formCount} agentCount={agentCount} connectedCount={connectedCount} todayCount={totals.forms_today} primaryColor={pc} isTV={isTV} />
          </>
        )}
      </div>

      {/* Right: metas */}
      <div className={`flex shrink-0 ${isTV ? "gap-6" : "gap-4"}`}>
        <MetaBar label="Meta datos" current={totals.forms_count} target={metaDatos} pct={datosProgress} color={pc} isTV={isTV} />
        <MetaBar label="Meta votos" current={null} target={metas.votos} pct={votosProgress} color={sc || pc} isTV={isTV} />
      </div>
    </header>
  );
}

/* ========== Segmented Control Button ========== */

function SegmentButton({ active, onClick, icon, label, activeColor, isTV = false }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label?: string; activeColor: string; isTV?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center rounded-full font-semibold tracking-wide transition-all duration-200 cursor-pointer border-none ${
        isTV ? "gap-2 px-5 py-2 text-[13px]" : label ? "gap-1.5 px-4 py-1.5 text-[11px]" : "px-3 py-1.5"
      } ${active ? "text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
      style={active ? { backgroundColor: activeColor } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

/* ========== KPI Groups ========== */

function CampoKpis({ formCount, agentCount, connectedCount, todayCount, primaryColor, isTV }: { formCount: number; agentCount: number; connectedCount: number; todayCount: number; primaryColor: string; isTV: boolean }) {
  const valCls = isTV ? "text-[28px]" : "text-[20px]";
  const lblCls = isTV ? "text-[11px]" : "text-[9px]";
  return (
    <div className={`flex items-center ${isTV ? "gap-5" : "gap-4"}`}>
      <KpiSlot value={formCount.toLocaleString()} label="Puntos" valCls={valCls} lblCls={lblCls} />
      <KpiDivider isTV={isTV} />
      <KpiSlot value={String(agentCount)} label="Agentes" valCls={valCls} lblCls={lblCls} />
      <KpiDivider isTV={isTV} />
      <KpiSlot value={String(connectedCount)} label="En linea" valCls={valCls} lblCls={lblCls} className={connectedCount > 0 ? "text-teal-600" : "text-slate-300"} />
      <KpiDivider isTV={isTV} />
      <KpiSlot value={`+${todayCount}`} label="Hoy" valCls={valCls} lblCls={lblCls} style={{ color: primaryColor }} />
    </div>
  );
}

/* ========== Sub-components ========== */

function KpiSlot({ value, label, className, style, valCls = "text-[20px]", lblCls = "text-[9px]" }: { value: string; label: string; className?: string; style?: React.CSSProperties; valCls?: string; lblCls?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`${valCls} font-black leading-tight tabular-nums ${className ?? "text-slate-800"}`} style={style}>{value}</span>
      <span className={`${lblCls} font-bold uppercase text-slate-500 tracking-wider`}>{label}</span>
    </div>
  );
}

function KpiDivider({ isTV = false }: { isTV?: boolean }) {
  return <div className={`w-px bg-slate-100 ${isTV ? "h-10" : "h-8"}`} />;
}

function MetaBar({ label, current, target, pct, color, isTV = false }: { label: string; current: number | null; target: number; pct: number; color: string; isTV?: boolean }) {
  return (
    <div className={`py-1 ${isTV ? "min-w-[200px]" : "min-w-[140px]"}`}>
      <div className="flex justify-between items-center mb-1">
        <span className={`font-semibold uppercase text-slate-400 tracking-wider ${isTV ? "text-[11px]" : "text-[9px]"}`}>{label}</span>
        <span className={`font-bold tabular-nums ${isTV ? "text-sm" : "text-xs"}`} style={{ color }}>{target > 0 ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div className={`bg-slate-100 rounded-full overflow-hidden ${isTV ? "h-2.5" : "h-2"}`}>
        <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className={`mt-1 ${isTV ? "text-xs" : "text-[11px]"}`}>
        <span className="font-bold text-slate-700">{current !== null ? current.toLocaleString() : "—"}</span>
        <span className="text-slate-300"> / {target > 0 ? target.toLocaleString() : "—"}</span>
      </div>
    </div>
  );
}

/* ========== Icons ========== */

function MapPinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" role="img"><title>Campo</title>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ChartBarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" role="img"><title>Pipeline</title>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" role="img"><title>Datos</title>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
