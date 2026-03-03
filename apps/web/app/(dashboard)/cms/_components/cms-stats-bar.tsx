"use client";

/**
 * CMS Stats Bar — Horizontal strip of status counters at the top of the CMS page.
 * Shows total, nuevos, hablados, respondieron, archivados with color coding.
 */

import type { CmsStats } from "@/lib/services/cms";

type CmsStatsBarProps = {
  stats: CmsStats | null;
  loading: boolean;
};

const STAT_ITEMS: { key: keyof CmsStats; label: string; color: string; bg: string }[] = [
  { key: "total", label: "Total", color: "text-slate-700", bg: "bg-slate-100" },
  { key: "nuevos", label: "Nuevos", color: "text-sky-700", bg: "bg-sky-50" },
  { key: "hablados", label: "Hablados", color: "text-amber-700", bg: "bg-amber-50" },
  { key: "respondieron", label: "Contestaron", color: "text-emerald-700", bg: "bg-emerald-50" },
  { key: "archivados", label: "Archivados", color: "text-slate-500", bg: "bg-slate-50" },
];

export function CmsStatsBar({ stats, loading }: CmsStatsBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm shrink-0 overflow-x-auto">
      {STAT_ITEMS.map((item) => (
        <div
          key={item.key}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${item.bg} shrink-0`}
        >
          <span className={`text-[11px] font-medium ${item.color}`}>{item.label}</span>
          <span className={`text-[11px] font-bold ${item.color} tabular-nums`}>
            {loading ? "\u2014" : (stats?.[item.key] ?? 0).toLocaleString("es-PE")}
          </span>
        </div>
      ))}
    </div>
  );
}
