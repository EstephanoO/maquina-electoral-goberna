"use client";

import { useState, useMemo } from "react";
import { useTheme } from "@/lib/theme-context";

/* ========== Types ========== */

type Props = {
  primaryColor: string;
  /** Total form submissions all-time */
  totalDatos: number;
  /** Forms in the currently selected period */
  periodDatos: number;
  /** Number of agentes de campo registered */
  agentesCampoCount: number;
  /** Campaign-configured meta de datos */
  metaDatos: number;
  /** Currently selected period key */
  period: "today" | "week" | "month" | "all";
  /** When set, hero card shows this agent's name instead of "Pipeline Global" */
  selectedAgentName?: string;
  /** Per-brigadista goal for the current period (used when agent drill-down active) */
  periodGoalPerBrig?: number;
};

/* ========== Helpers ========== */

function calcDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)), 0);
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE");
}

/* ========== Component ========== */

export function PipelineFunnel({ primaryColor, totalDatos, periodDatos, agentesCampoCount, metaDatos: campaignMeta, period, selectedAgentName, periodGoalPerBrig: periodGoalOverride }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  // ── Editable goal inputs ──
  const [metaDatos, setMetaDatos] = useState(campaignMeta > 0 ? campaignMeta : 200000);
  const [brigadistasGoal, setBrigadistasGoal] = useState(agentesCampoCount > 0 ? agentesCampoCount : 40);
  const [fechaLimite, setFechaLimite] = useState("2026-04-10");
  const [showConfig, setShowConfig] = useState(false);

  // ── Derived calculations ──
  const dias = useMemo(() => calcDaysUntil(fechaLimite), [fechaLimite]);
  const metaDiaria = useMemo(() => dias > 0 ? Math.ceil(metaDatos / dias) : 0, [metaDatos, dias]);
  // ── Period-adaptive goal (agent drill-down uses per-brig goal) ──
  const isAgentMode = !!selectedAgentName;
  const periodGoal = useMemo(() => {
    if (isAgentMode && periodGoalOverride != null) {
      const labels: Record<string, string> = { today: "Meta del dia", week: "Meta semanal", month: "Meta mensual", all: "Meta total" };
      return { label: labels[period] ?? "Meta", target: periodGoalOverride, current: periodDatos };
    }
    if (period === "today") return { label: "Meta de hoy", target: metaDiaria, current: periodDatos };
    if (period === "week") return { label: "Meta semanal", target: metaDiaria * 7, current: periodDatos };
    if (period === "month") return { label: "Meta mensual", target: metaDiaria * 30, current: periodDatos };
    return { label: "Meta total", target: metaDatos, current: totalDatos };
  }, [period, metaDiaria, metaDatos, periodDatos, totalDatos, isAgentMode, periodGoalOverride]);

  const periodPct = periodGoal.target > 0 ? Math.min((periodGoal.current / periodGoal.target) * 100, 100) : 0;
  const periodRemaining = Math.max(periodGoal.target - periodGoal.current, 0);

  // ── Urgency ──
  const urgencyColor = dias <= 7 ? "#ef4444" : dias <= 14 ? "#facc15" : "#10b981";

  return (
    <div className="px-4 py-3">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-400"}`}>
            {isAgentMode ? selectedAgentName : "Pipeline Global"}
          </h3>
          {!isAgentMode && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "border border-[#223347] bg-transparent text-slate-200" : "bg-slate-100 text-slate-600"}`}>
              {brigadistasGoal} brigadistas
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${isDark ? "border border-[#343b47] bg-transparent text-slate-200 hover:bg-transparent" : "border border-slate-200 bg-white text-slate-400 hover:bg-slate-50"}`}
        >
          {showConfig ? "Ocultar" : "Configurar"}
        </button>
      </div>

      {/* ═══ Config (collapsible) ═══ */}
      {showConfig && (
        <div className={`flex gap-3 mb-3 p-2.5 rounded-xl ${isDark ? "bg-[#090D15] border border-[#1d2f43]" : "bg-slate-50 border border-slate-200/80"}`}>
          <ConfigInput label="Meta de Datos" value={metaDatos} onChange={setMetaDatos} step={1000} min={0} />
          <ConfigInput
            label="Brigadistas"
            value={brigadistasGoal}
            onChange={setBrigadistasGoal}
            min={1}
            hint={agentesCampoCount > 0 && brigadistasGoal !== agentesCampoCount ? `Usar actual (${agentesCampoCount})` : undefined}
            onHintClick={agentesCampoCount > 0 && brigadistasGoal !== agentesCampoCount ? () => setBrigadistasGoal(agentesCampoCount) : undefined}
          />
          <div className="flex-1 min-w-0">
            <label htmlFor="pipeline-fecha-limite" className={`text-[9px] font-semibold uppercase tracking-wide mb-1 block ${isDark ? "text-slate-400" : "text-slate-400"}`}>Fecha Limite</label>
            <input
              id="pipeline-fecha-limite"
              type="date"
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
              className={`w-full px-2.5 py-1.5 text-[13px] font-bold rounded-lg outline-none transition-colors tabular-nums ${isDark ? "text-slate-100 bg-[#090D15] border border-[#343b47] focus:border-blue-400" : "text-slate-700 bg-white border border-slate-200 focus:border-blue-300"}`}
            />
            <span className={`text-[9px] font-semibold mt-0.5 block ${dias <= 7 ? "text-red-500" : "text-slate-400"}`}>{dias} dias</span>
          </div>
        </div>
      )}

      {/* ═══ Hero Card (light) ═══ */}
      <div
        className={`relative overflow-hidden rounded-2xl mb-3 ${isDark ? "border border-[#1d2f43]" : "border border-slate-200/80"}`}
        style={{ background: isDark ? "#090D15" : `linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, ${primaryColor}08 100%)`, boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="relative flex items-center gap-5 px-5 py-4">
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 block ${isDark ? "text-slate-400" : "text-slate-400"}`}>{periodGoal.label}</span>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className={`text-[32px] font-black tabular-nums leading-none ${isDark ? "text-slate-50" : "text-slate-900"}`}>{fmt(periodGoal.current)}</span>
              <span className="text-[20px] font-black tabular-nums leading-none" style={{ color: periodPct >= 100 ? "#63d58a" : (isDark ? "#facc15" : primaryColor) }}>{periodPct.toFixed(0)}%</span>
              <span className={`text-[16px] font-bold ${isDark ? "text-slate-400" : "text-slate-300"}`}>/ {fmt(periodGoal.target)}</span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden mb-1.5 ${isDark ? "bg-transparent" : "bg-slate-200/80"}`} style={isDark ? { backgroundColor: "rgba(250, 204, 21, 0.18)" } : undefined}>
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${periodPct}%`,
                  background: periodPct >= 100 ? "linear-gradient(90deg, #facc15, #eab308)" : "linear-gradient(90deg, #facc15, #eab308)",
                }}
              />
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-400"}`}>
                {periodRemaining > 0 ? <>Faltan <strong className={isDark ? "text-slate-100" : "text-slate-700"}>{fmt(periodRemaining)}</strong></> : <strong className="text-emerald-500">Meta alcanzada</strong>}
                </span>
              <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: urgencyColor }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: urgencyColor }} />
                {dias}d restantes
              </span>
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}

/* ========== Sub-components ========== */

function ConfigInput({ label, value, onChange, step, min, hint, onHintClick }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
  hint?: string; onHintClick?: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const id = `pipeline-cfg-${label.replace(/\s/g, "-").toLowerCase()}`;
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className={`text-[9px] font-semibold uppercase tracking-wide mb-1 block ${isDark ? "text-slate-400" : "text-slate-400"}`}>{label}</label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min ?? 0, parseInt(e.target.value, 10) || 0))}
        step={step}
        min={min}
        className={`w-full px-2.5 py-1.5 text-[13px] font-bold rounded-lg outline-none transition-colors tabular-nums ${isDark ? "text-slate-100 bg-[#090D15] border border-[#343b47] focus:border-blue-400" : "text-slate-700 bg-white border border-slate-200 focus:border-blue-300"}`}
      />
      {hint && (
        <button type="button" onClick={onHintClick} className={`text-[9px] font-semibold mt-0.5 block bg-transparent border-none cursor-pointer p-0 underline ${isDark ? "text-blue-300" : "text-blue-500"}`}>
          {hint}
        </button>
      )}
    </div>
  );
}
