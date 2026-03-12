"use client";

import { useMemo, useCallback } from "react";
import type { FormRecord } from "@/lib/services";
import { useTheme } from "@/lib/theme-context";

/* ========== Types ========== */

export type GeoLevel = "departamento" | "provincia" | "distrito";

export type GeoDrillState = {
  level: GeoLevel;
  departamento: string | null;
  provincia: string | null;
};

export type GeoRankingEntry = {
  name: string;
  count: number;
  pct: number;
};

type Props = {
  forms: FormRecord[];
  drill: GeoDrillState;
  onDrillChange: (d: GeoDrillState) => void;
  primaryColor: string;
};

/* ========== Initial state ========== */

export const INITIAL_GEO_DRILL: GeoDrillState = {
  level: "departamento",
  departamento: null,
  provincia: null,
};

/* ========== Helpers ========== */

const MEDAL_COLORS = ["#facc15", "#94a3b8", "#cd7f32"] as const;

function buildRanking(forms: FormRecord[], field: keyof FormRecord): GeoRankingEntry[] {
  const counts = new Map<string, number>();
  for (const f of forms) {
    const val = f[field];
    if (typeof val === "string" && val) {
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }
  const total = forms.length || 1;
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

/* ========== Component ========== */

export function GeoRanking({ forms, drill, onDrillChange, primaryColor }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Scope forms to the current drill level
  const scopedForms = useMemo(() => {
    let filtered = forms;
    if (drill.departamento) filtered = filtered.filter((f) => f.departamento === drill.departamento);
    if (drill.provincia) filtered = filtered.filter((f) => f.provincia === drill.provincia);
    return filtered;
  }, [forms, drill.departamento, drill.provincia]);

  // Build ranking for the current level
  const ranking = useMemo(() => {
    if (drill.level === "departamento") return buildRanking(forms, "departamento");
    if (drill.level === "provincia") return buildRanking(scopedForms, "provincia");
    return buildRanking(scopedForms, "distrito");
  }, [forms, scopedForms, drill.level]);

  const maxCount = ranking[0]?.count ?? 1;

  // Click handler: drill into next level
  const handleRowClick = useCallback((name: string) => {
    if (drill.level === "departamento") {
      onDrillChange({ level: "provincia", departamento: name, provincia: null });
    } else if (drill.level === "provincia") {
      onDrillChange({ level: "distrito", departamento: drill.departamento, provincia: name });
    }
    // distrito level = no further drill
  }, [drill, onDrillChange]);

  // Breadcrumb navigation
  const handleBreadcrumb = useCallback((target: GeoLevel) => {
    if (target === "departamento") {
      onDrillChange(INITIAL_GEO_DRILL);
    } else if (target === "provincia") {
      onDrillChange({ level: "provincia", departamento: drill.departamento, provincia: null });
    }
  }, [drill.departamento, onDrillChange]);

  const canDrill = drill.level !== "distrito";
  const levelLabel = drill.level === "departamento" ? "Departamentos" : drill.level === "provincia" ? "Provincias" : "Distritos";

  return (
    <div className="flex flex-col min-h-0">
      {/* Breadcrumb */}
      <div className={`flex items-center gap-1 px-4 py-2 text-[11px] ${isDark ? "text-slate-400" : "text-slate-400"}`}>
        <button
          type="button"
          onClick={() => handleBreadcrumb("departamento")}
          className={`cursor-pointer border-none bg-transparent font-semibold transition-colors ${
            drill.level === "departamento"
              ? (isDark ? "text-slate-200" : "text-slate-700")
              : (isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-700")
          }`}
          style={drill.level === "departamento" ? { color: primaryColor } : undefined}
        >
          Peru
        </button>
        {drill.departamento && (
          <>
            <span className={isDark ? "text-slate-500" : "text-slate-300"}>/</span>
            <button
              type="button"
              onClick={() => handleBreadcrumb("provincia")}
              className={`cursor-pointer border-none bg-transparent font-semibold transition-colors truncate max-w-[120px] ${
                drill.level === "provincia"
                  ? (isDark ? "text-slate-200" : "text-slate-700")
                  : (isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-700")
              }`}
              style={drill.level === "provincia" ? { color: primaryColor } : undefined}
            >
              {drill.departamento}
            </button>
          </>
        )}
        {drill.provincia && (
          <>
            <span className={isDark ? "text-slate-500" : "text-slate-300"}>/</span>
            <span className="font-semibold truncate max-w-[120px]" style={{ color: primaryColor }}>
              {drill.provincia}
            </span>
          </>
        )}
        <span className={`ml-auto text-[10px] tabular-nums ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          {ranking.length} {levelLabel.toLowerCase()}
        </span>
      </div>

      {/* Ranking rows */}
      {ranking.length === 0 ? (
        <div className={`flex items-center justify-center py-8 text-[12px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          Sin datos en este nivel
        </div>
      ) : (
        <div className="flex flex-col overflow-y-auto max-h-[400px] hide-scrollbar">
          {ranking.map((entry, i) => {
            const barWidth = Math.max(4, (entry.count / maxCount) * 100);
            const medal = i < 3 ? MEDAL_COLORS[i] : null;
            const isClickable = canDrill;

            return (
              <button
                type="button"
                key={entry.name}
                onClick={() => isClickable && handleRowClick(entry.name)}
                disabled={!isClickable}
                className={`flex items-center gap-2.5 px-4 py-2 text-left border-none transition-colors w-full ${
                  isClickable ? "cursor-pointer" : "cursor-default"
                } ${isDark
                  ? `bg-transparent ${isClickable ? "hover:bg-[#111827]" : ""}`
                  : `bg-transparent ${isClickable ? "hover:bg-slate-50" : ""}`
                }`}
              >
                {/* Rank number / medal */}
                <span
                  className="w-5 text-center text-[11px] font-bold tabular-nums shrink-0"
                  style={medal ? { color: medal } : { color: isDark ? "#475569" : "#94a3b8" }}
                >
                  {i + 1}
                </span>

                {/* Name + bar */}
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                    {entry.name}
                  </div>
                  <div className={`mt-1 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-[#1e293b]" : "bg-slate-100"}`}>
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${barWidth}%`, backgroundColor: primaryColor, opacity: 0.8 }}
                    />
                  </div>
                </div>

                {/* Count + percentage */}
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[13px] font-extrabold tabular-nums" style={{ color: primaryColor }}>
                    {entry.count.toLocaleString("es-PE")}
                  </span>
                  <span className={`text-[9px] tabular-nums ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {entry.pct.toFixed(1)}%
                  </span>
                </div>

                {/* Drill arrow */}
                {isClickable && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#475569" : "#cbd5e1"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
