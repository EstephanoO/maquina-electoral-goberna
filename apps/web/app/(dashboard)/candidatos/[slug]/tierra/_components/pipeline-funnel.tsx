"use client";

import type { CmsBrigadistaMetrics } from "@/lib/types";

/* ========== Types ========== */

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  primaryColor: string;
};

/* ========== Component ========== */

export function PipelineFunnel({ brigadistas, primaryColor }: Props) {
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
  const maxVal = Math.max(totals.captures, 1);

  const stages = [
    { label: "Capturados", value: totals.captures, color: primaryColor },
    { label: "Nuevos", value: totals.nuevos, color: "#94a3b8" },
    { label: "Hablados", value: totals.hablados, color: "#f59e0b" },
    { label: "Respondieron", value: totals.respondieron, color: "#10b981" },
    { label: "Archivados", value: totals.archivados, color: "#cbd5e1" },
  ];

  if (brigadistas.length === 0) return null;

  return (
    <div className="px-4 py-3">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pipeline Global</h3>
          <span className="text-[10px] text-slate-400 tabular-nums">
            {brigadistas.length} brigadista{brigadistas.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <RateChip label="Contact" value={contactRate} color={primaryColor} />
          <RateChip label="Response" value={responseRate} color="#10b981" />
        </div>
      </div>

      {/* Stages row — horizontal bars */}
      <div className="flex gap-3">
        {stages.map((stage) => {
          const fillPct = maxVal > 0 ? Math.max((stage.value / maxVal) * 100, 4) : 4;
          return (
            <div key={stage.label} className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: stage.color }}>
                  {stage.label}
                </span>
                <span className="text-[13px] font-bold text-slate-700 tabular-nums">{stage.value.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${fillPct}%`, backgroundColor: stage.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========== Rate Chip ========== */

function RateChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-[13px] font-extrabold tabular-nums" style={{ color }}>{value}%</span>
    </div>
  );
}
