"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CampaignStats } from "@/lib/types";

/* ========== Types ========== */

export type TierraViewMode = "campo" | "pipeline";

type Props = {
  stats: CampaignStats;
  agentCount: number;
  formCount: number;
  connectedCount: number;
  viewMode: TierraViewMode;
  onViewModeChange: (mode: TierraViewMode) => void;
  /** Aggregated pipeline totals (derived from brigadista metrics) */
  pipelineTotals?: {
    captures: number;
    contacted: number;
    responded: number;
    contactRate: number;
  };
};

/* ========== Component ========== */

export function TierraHeader({ stats, agentCount, formCount, connectedCount, viewMode, onViewModeChange, pipelineTotals }: Props) {
  const router = useRouter();
  const { campaign, metas, totals } = stats;
  const pc = campaign.color_primario;
  const sc = campaign.color_secundario;

  const datosProgress = metas.datos > 0 ? Math.min((totals.forms_count / metas.datos) * 100, 100) : 0;
  const votosProgress = metas.votos > 0 ? Math.min((totals.forms_count / metas.votos) * 100, 100) : 0;

  return (
    <header className="flex items-center justify-between h-16 px-5 bg-white border-b border-slate-200/80 shrink-0 gap-5 z-20">
      {/* Left: back + candidate identity */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 cursor-pointer flex items-center justify-center shrink-0 hover:bg-slate-100 hover:text-slate-600 transition-colors"
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
          <div className="text-sm font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">{campaign.name}</div>
          <div className="flex gap-2 text-[11px] text-slate-400">
            {campaign.cargo && <span>{campaign.cargo}</span>}
            {campaign.numero && <span className="font-semibold text-slate-500">N.° {campaign.numero}</span>}
            {campaign.partido && <span className="italic">{campaign.partido}</span>}
          </div>
        </div>
      </div>

      {/* Center: segmented control + KPIs */}
      <div className="flex items-center gap-5">
        {/* Segmented control — pill style */}
        <div className="flex rounded-full bg-slate-100 p-0.5">
          <SegmentButton
            active={viewMode === "campo"}
            onClick={() => onViewModeChange("campo")}
            icon={<MapPinIcon />}
            label="Campo"
            activeColor={pc}
          />
          <SegmentButton
            active={viewMode === "pipeline"}
            onClick={() => onViewModeChange("pipeline")}
            icon={<ChartBarIcon />}
            label="Pipeline"
            activeColor={pc}
          />
        </div>

        <div className="w-px h-8 bg-slate-200/70" />

        {/* Contextual KPIs */}
        {viewMode === "campo" ? (
          <CampoKpis formCount={formCount} agentCount={agentCount} connectedCount={connectedCount} todayCount={totals.forms_today} primaryColor={pc} />
        ) : (
          <PipelineKpis totals={pipelineTotals} primaryColor={pc} />
        )}
      </div>

      {/* Right: metas (both modes) */}
      <div className="flex gap-4 shrink-0">
        <MetaBar label="Meta datos" current={totals.forms_count} target={metas.datos} pct={datosProgress} color={pc} />
        <MetaBar label="Meta votos" current={null} target={metas.votos} pct={votosProgress} color={sc || pc} />
      </div>
    </header>
  );
}

/* ========== Segmented Control Button ========== */

function SegmentButton({ active, onClick, icon, label, activeColor }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; activeColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all duration-200 cursor-pointer border-none ${
        active ? "text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
      style={active ? { backgroundColor: activeColor } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

/* ========== KPI Groups ========== */

function CampoKpis({ formCount, agentCount, connectedCount, todayCount, primaryColor }: { formCount: number; agentCount: number; connectedCount: number; todayCount: number; primaryColor: string }) {
  return (
    <div className="flex items-center gap-4">
      <KpiSlot value={formCount.toLocaleString()} label="Puntos" />
      <KpiDivider />
      <KpiSlot value={String(agentCount)} label="Agentes" />
      <KpiDivider />
      <KpiSlot value={String(connectedCount)} label="En linea" className={connectedCount > 0 ? "text-teal-600" : "text-slate-300"} />
      <KpiDivider />
      <KpiSlot value={`+${todayCount}`} label="Hoy" style={{ color: primaryColor }} />
    </div>
  );
}

function PipelineKpis({ totals, primaryColor }: { totals?: { captures: number; contacted: number; responded: number; contactRate: number }; primaryColor: string }) {
  if (!totals) return <span className="text-xs text-slate-400">Cargando...</span>;
  return (
    <div className="flex items-center gap-4">
      <KpiSlot value={totals.captures.toLocaleString()} label="Capturados" style={{ color: primaryColor }} />
      <KpiDivider />
      <KpiSlot value={totals.contacted.toLocaleString()} label="Contactados" className="text-amber-500" />
      <KpiDivider />
      <KpiSlot value={totals.responded.toLocaleString()} label="Respondieron" className="text-emerald-500" />
      <KpiDivider />
      <KpiSlot value={`${totals.contactRate}%`} label="Contact Rate" style={{ color: primaryColor }} />
    </div>
  );
}

/* ========== Sub-components ========== */

function KpiSlot({ value, label, className, style }: { value: string; label: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-lg font-extrabold leading-tight tabular-nums ${className ?? "text-slate-800"}`} style={style}>{value}</span>
      <span className="text-[9px] font-medium uppercase text-slate-400 tracking-wider">{label}</span>
    </div>
  );
}

function KpiDivider() {
  return <div className="w-px h-8 bg-slate-100" />;
}

function MetaBar({ label, current, target, pct, color }: { label: string; current: number | null; target: number; pct: number; color: string }) {
  return (
    <div className="min-w-[140px] py-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9px] font-semibold uppercase text-slate-400 tracking-wider">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{target > 0 ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1 text-[11px]">
        <span className="font-bold text-slate-700">{current !== null ? current.toLocaleString() : "—"}</span>
        <span className="text-slate-300"> / {target > 0 ? target.toLocaleString() : "—"}</span>
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
