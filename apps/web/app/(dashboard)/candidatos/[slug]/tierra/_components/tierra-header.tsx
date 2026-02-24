"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CampaignStats, CmsBrigadistaMetrics } from "@/lib/types";

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
    <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-slate-200 shrink-0 gap-4 z-20">
      {/* Left: back + candidate identity */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="w-[30px] h-[30px] rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-pointer flex items-center justify-center shrink-0"
          aria-label="Volver"
          title="Volver"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Volver</title><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className="w-[34px] h-[34px] rounded-full overflow-hidden border-2 shrink-0" style={{ borderColor: sc || pc }}>
          {campaign.foto_url ? (
            <Image src={campaign.foto_url} alt="" width={32} height={32} className="w-full h-full object-cover" unoptimized />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-white text-[11px] font-extrabold" style={{ backgroundColor: pc }}>
              {campaign.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">{campaign.name}</div>
          <div className="flex gap-2 text-[11px] text-slate-500">
            {campaign.cargo && <span>{campaign.cargo}</span>}
            {campaign.numero && <span className="font-semibold">N.° {campaign.numero}</span>}
            {campaign.partido && <span className="italic">{campaign.partido}</span>}
          </div>
        </div>
      </div>

      {/* Center: segmented control + KPIs */}
      <div className="flex items-center gap-4">
        {/* Segmented control */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => onViewModeChange("campo")}
            className="px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors duration-150 cursor-pointer border-none"
            style={{
              backgroundColor: viewMode === "campo" ? pc : "transparent",
              color: viewMode === "campo" ? "#fff" : "#64748b",
            }}
          >
            🗺️ Campo
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("pipeline")}
            className="px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors duration-150 cursor-pointer border-none border-l border-slate-200"
            style={{
              backgroundColor: viewMode === "pipeline" ? pc : "transparent",
              color: viewMode === "pipeline" ? "#fff" : "#64748b",
            }}
          >
            📊 Pipeline
          </button>
        </div>

        <div className="w-px h-7 bg-slate-200" />

        {/* Contextual KPIs */}
        {viewMode === "campo" ? (
          <CampoKpis formCount={formCount} agentCount={agentCount} connectedCount={connectedCount} todayCount={totals.forms_today} primaryColor={pc} />
        ) : (
          <PipelineKpis totals={pipelineTotals} primaryColor={pc} />
        )}
      </div>

      {/* Right: metas (both modes) */}
      <div className="flex gap-3 shrink-0">
        <MetaBar label="Meta datos" current={totals.forms_count} target={metas.datos} pct={datosProgress} color={pc} />
        <MetaBar label="Meta votos" current={null} target={metas.votos} pct={votosProgress} color={sc || pc} />
      </div>
    </header>
  );
}

/* ========== Sub-components ========== */

function CampoKpis({ formCount, agentCount, connectedCount, todayCount, primaryColor }: { formCount: number; agentCount: number; connectedCount: number; todayCount: number; primaryColor: string }) {
  return (
    <div className="flex items-center gap-3">
      <KpiSlot value={formCount.toLocaleString()} label="Puntos" />
      <div className="w-px h-7 bg-slate-200" />
      <KpiSlot value={String(agentCount)} label="Agentes" />
      <div className="w-px h-7 bg-slate-200" />
      <KpiSlot value={String(connectedCount)} label="En linea" className={connectedCount > 0 ? "text-teal-600" : "text-slate-400"} />
      <div className="w-px h-7 bg-slate-200" />
      <KpiSlot value={`+${todayCount}`} label="Hoy" style={{ color: primaryColor }} />
    </div>
  );
}

function PipelineKpis({ totals, primaryColor }: { totals?: { captures: number; contacted: number; responded: number; contactRate: number }; primaryColor: string }) {
  if (!totals) return <span className="text-xs text-slate-400">Cargando...</span>;
  return (
    <div className="flex items-center gap-3">
      <KpiSlot value={totals.captures.toLocaleString()} label="Capturados" style={{ color: primaryColor }} />
      <div className="w-px h-7 bg-slate-200" />
      <KpiSlot value={totals.contacted.toLocaleString()} label="Contactados" className="text-amber-500" />
      <div className="w-px h-7 bg-slate-200" />
      <KpiSlot value={totals.responded.toLocaleString()} label="Respondieron" className="text-emerald-500" />
      <div className="w-px h-7 bg-slate-200" />
      <KpiSlot value={`${totals.contactRate}%`} label="Contact Rate" style={{ color: primaryColor }} />
    </div>
  );
}

function KpiSlot({ value, label, className, style }: { value: string; label: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-base font-extrabold leading-tight ${className ?? "text-slate-800"}`} style={style}>{value}</span>
      <span className="text-[9px] font-semibold uppercase text-slate-400 tracking-wide">{label}</span>
    </div>
  );
}

function MetaBar({ label, current, target, pct, color }: { label: string; current: number | null; target: number; pct: number; color: string }) {
  return (
    <div className="min-w-[140px] py-1">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wide">{label}</span>
        <span className="text-xs font-extrabold" style={{ color }}>{target > 0 ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div className="h-1 bg-slate-200 rounded-sm overflow-hidden">
        <div className="h-full rounded-sm transition-[width] duration-400 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-0.5 text-[11px]">
        <span className="font-bold text-slate-800">{current !== null ? current.toLocaleString() : "—"}</span>
        <span className="text-slate-400"> / {target > 0 ? target.toLocaleString() : "—"}</span>
      </div>
    </div>
  );
}
