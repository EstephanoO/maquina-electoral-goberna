"use client";

import type { CmsBrigadistaMetrics } from "@/lib/types";
import { PipelineFunnel } from "./pipeline-funnel";
import { BrigadistaTable } from "./brigadista-table";

/* ========== Types ========== */

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  isLoading: boolean;
  primaryColor: string;
};

/* ========== Component ========== */

export function PipelineView({ brigadistas, isLoading, primaryColor }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-3">
        <div className="w-6 h-6 border-[3px] border-slate-200 border-t-blue-700 rounded-full animate-spin" />
        <span className="text-sm text-slate-500">Cargando metricas...</span>
      </div>
    );
  }

  if (brigadistas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center p-12">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <title>Sin datos</title>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span className="text-base font-semibold text-slate-600">Sin datos de brigadistas</span>
        <span className="text-sm text-slate-400">Los datos apareceran cuando los brigadistas capturen probabilidades de voto con telefono</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left: Funnel sidebar */}
      <div className="w-[280px] shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
        <PipelineFunnel brigadistas={brigadistas} primaryColor={primaryColor} />
      </div>

      {/* Right: Brigadista table */}
      <div className="flex-1 min-w-0 bg-white">
        <BrigadistaTable brigadistas={brigadistas} primaryColor={primaryColor} />
      </div>
    </div>
  );
}
