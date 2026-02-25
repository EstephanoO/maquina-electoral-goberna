"use client";

import { useState, useMemo } from "react";

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
  const urgencyColor = dias <= 7 ? "#ef4444" : dias <= 14 ? "#f59e0b" : "#10b981";

  // ── SVG ring ──
  const ringR = 38;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC - (periodPct / 100) * ringC;

  return (
    <div className="px-4 py-3">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {isAgentMode ? selectedAgentName : "Pipeline Global"}
          </h3>
          {!isAgentMode && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {brigadistasGoal} brigadistas
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-500 cursor-pointer hover:bg-slate-50 transition-colors"
        >
          {showConfig ? "Ocultar" : "Configurar"}
        </button>
      </div>

      {/* ═══ Config (collapsible) ═══ */}
      {showConfig && (
        <div className="flex gap-3 mb-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
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
            <label htmlFor="pipeline-fecha-limite" className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1 block">Fecha Limite</label>
            <input
              id="pipeline-fecha-limite"
              type="date"
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[13px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-300 transition-colors tabular-nums"
            />
            <span className={`text-[9px] font-semibold mt-0.5 block ${dias <= 7 ? "text-red-500" : "text-slate-400"}`}>{dias} dias</span>
          </div>
        </div>
      )}

      {/* ═══ Hero Card (light) ═══ */}
      <div
        className="relative overflow-hidden rounded-2xl mb-3 border border-slate-200/80"
        style={{ background: `linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, ${primaryColor}08 100%)`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="relative flex items-center gap-5 px-5 py-4">
          {/* SVG ring */}
          <div className="relative shrink-0 w-[92px] h-[92px]">
            <svg width="92" height="92" viewBox="0 0 92 92" className="transform -rotate-90" role="img" aria-label={`${periodPct.toFixed(0)}% progreso`}>
              <title>{periodPct.toFixed(0)}% progreso</title>
              <circle cx="46" cy="46" r={ringR} fill="none" stroke="#e2e8f0" strokeWidth="7" />
              <circle
                cx="46" cy="46" r={ringR} fill="none"
                stroke={periodPct >= 100 ? "#10b981" : primaryColor}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={ringC} strokeDashoffset={ringOffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-black tabular-nums leading-none" style={{ color: periodPct >= 100 ? "#10b981" : primaryColor }}>{periodPct.toFixed(0)}%</span>
            </div>
          </div>

          {/* Numbers */}
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">{periodGoal.label}</span>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-[32px] font-black tabular-nums leading-none text-slate-900">{fmt(periodGoal.current)}</span>
              <span className="text-[16px] text-slate-300 font-bold">/ {fmt(periodGoal.target)}</span>
            </div>
            <div className="h-2 bg-slate-200/80 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${periodPct}%`,
                  background: periodPct >= 100 ? "linear-gradient(90deg, #10b981, #059669)" : `linear-gradient(90deg, ${primaryColor}, ${primaryColor}cc)`,
                }}
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-slate-400">
                {periodRemaining > 0 ? <>Faltan <strong className="text-slate-700">{fmt(periodRemaining)}</strong></> : <strong className="text-emerald-500">Meta alcanzada</strong>}
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
  const id = `pipeline-cfg-${label.replace(/\s/g, "-").toLowerCase()}`;
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1 block">{label}</label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min ?? 0, parseInt(e.target.value, 10) || 0))}
        step={step}
        min={min}
        className="w-full px-2.5 py-1.5 text-[13px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-300 transition-colors tabular-nums"
      />
      {hint && (
        <button type="button" onClick={onHintClick} className="text-[9px] text-blue-500 font-semibold mt-0.5 block bg-transparent border-none cursor-pointer p-0 underline">
          {hint}
        </button>
      )}
    </div>
  );
}
