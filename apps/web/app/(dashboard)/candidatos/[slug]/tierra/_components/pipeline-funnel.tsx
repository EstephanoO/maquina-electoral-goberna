"use client";

import type { CmsBrigadistaMetrics } from "@/lib/types";

/* ========== Types ========== */

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  primaryColor: string;
};

type FunnelStage = {
  label: string;
  value: number;
  color: string;
  bgColor: string;
};

/* ========== Component ========== */

export function PipelineFunnel({ brigadistas, primaryColor }: Props) {
  // Aggregate totals across all brigadistas
  const totals = brigadistas.reduce(
    (acc, b) => ({
      captures: acc.captures + b.total_captures,
      nuevos: acc.nuevos + b.nuevos,
      hablados: acc.hablados + b.hablados,
      respondieron: acc.respondieron + b.respondieron,
      archivados: acc.archivados + b.archivados,
    }),
    { captures: 0, nuevos: 0, hablados: 0, respondieron: 0, archivados: 0 },
  );

  const contacted = totals.hablados + totals.respondieron;
  const contactRate = totals.captures > 0 ? Math.round((contacted / totals.captures) * 100) : 0;
  const responseRate = contacted > 0 ? Math.round((totals.respondieron / contacted) * 100) : 0;

  const stages: FunnelStage[] = [
    { label: "Capturados", value: totals.captures, color: primaryColor, bgColor: `${primaryColor}18` },
    { label: "Nuevos", value: totals.nuevos, color: "#64748b", bgColor: "#f1f5f9" },
    { label: "Hablados", value: totals.hablados, color: "#f59e0b", bgColor: "#fffbeb" },
    { label: "Respondieron", value: totals.respondieron, color: "#10b981", bgColor: "#ecfdf5" },
    { label: "Archivados", value: totals.archivados, color: "#94a3b8", bgColor: "#f8fafc" },
  ];

  const maxValue = Math.max(totals.captures, 1);

  return (
    <div className="flex flex-col h-full p-4 gap-5">
      {/* Title */}
      <div>
        <h3 className="text-sm font-bold text-slate-800">Pipeline Global</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">{brigadistas.length} brigadista{brigadistas.length !== 1 ? "s" : ""} activo{brigadistas.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Funnel bars */}
      <div className="flex flex-col gap-2.5 flex-1">
        {stages.map((stage) => {
          const widthPct = maxValue > 0 ? Math.max((stage.value / maxValue) * 100, 4) : 4;
          return (
            <div key={stage.label}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: stage.color }}>{stage.label}</span>
                <span className="text-sm font-bold text-slate-700">{stage.value.toLocaleString()}</span>
              </div>
              <div className="h-5 bg-slate-100 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-[width] duration-500 ease-out flex items-center justify-end pr-2"
                  style={{ width: `${widthPct}%`, backgroundColor: stage.bgColor, borderLeft: `3px solid ${stage.color}` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Rates */}
      <div className="border-t border-slate-200 pt-3 flex flex-col gap-2">
        <RateStat label="Contact Rate" value={contactRate} description="Hablados + respondieron / total" primaryColor={primaryColor} />
        <RateStat label="Response Rate" value={responseRate} description="Respondieron / contactados" primaryColor="#10b981" />
      </div>
    </div>
  );
}

/* ========== Sub-components ========== */

function RateStat({ label, value, description, primaryColor }: { label: string; value: number; description: string; primaryColor: string }) {
  return (
    <div>
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-lg font-extrabold" style={{ color: primaryColor }}>{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-sm overflow-hidden mt-1">
        <div className="h-full rounded-sm transition-[width] duration-500 ease-out" style={{ width: `${value}%`, backgroundColor: primaryColor }} />
      </div>
      <span className="text-[9px] text-slate-400 mt-0.5">{description}</span>
    </div>
  );
}
