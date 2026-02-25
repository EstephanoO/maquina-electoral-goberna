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

export function PipelineFunnel({ primaryColor, totalDatos, periodDatos, agentesCampoCount, metaDatos: campaignMeta, period }: Props) {
  // ── Editable goal inputs ──
  const [metaDatos, setMetaDatos] = useState(campaignMeta > 0 ? campaignMeta : 200000);
  const [brigadistasGoal, setBrigadistasGoal] = useState(agentesCampoCount > 0 ? agentesCampoCount : 40);
  const [fechaLimite, setFechaLimite] = useState("2026-04-10");
  const [showConfig, setShowConfig] = useState(false);

  // ── Derived calculations ──
  const dias = useMemo(() => calcDaysUntil(fechaLimite), [fechaLimite]);
  const metaDiaria = useMemo(() => dias > 0 ? Math.ceil(metaDatos / dias) : 0, [metaDatos, dias]);
  const metaPorBrigDia = useMemo(() => brigadistasGoal > 0 && dias > 0 ? Math.ceil(metaDatos / (brigadistasGoal * dias)) : 0, [metaDatos, brigadistasGoal, dias]);
  const metaPorBrigTotal = useMemo(() => brigadistasGoal > 0 ? Math.ceil(metaDatos / brigadistasGoal) : 0, [metaDatos, brigadistasGoal]);

  // ── Period-adaptive goal ──
  const periodGoal = useMemo(() => {
    if (period === "today") return { label: "Meta de hoy", target: metaDiaria, current: periodDatos };
    if (period === "week") return { label: "Meta semanal", target: metaDiaria * 7, current: periodDatos };
    if (period === "month") return { label: "Meta mensual", target: metaDiaria * 30, current: periodDatos };
    return { label: "Meta total", target: metaDatos, current: totalDatos };
  }, [period, metaDiaria, metaDatos, periodDatos, totalDatos]);

  const periodPct = periodGoal.target > 0 ? Math.min((periodGoal.current / periodGoal.target) * 100, 100) : 0;
  const periodRemaining = Math.max(periodGoal.target - periodGoal.current, 0);

  // ── Global progress (always visible) ──
  const globalPct = metaDatos > 0 ? Math.min((totalDatos / metaDatos) * 100, 100) : 0;
  const globalRemaining = Math.max(metaDatos - totalDatos, 0);

  return (
    <div className="px-4 py-3">
      {/* ═══ Section header ═══ */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pipeline Global</h3>
          <span className="text-[10px] text-slate-400 tabular-nums">{brigadistasGoal} brigadistas</span>
        </div>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-500 cursor-pointer hover:bg-slate-50 transition-colors"
        >
          {showConfig ? "Ocultar" : "Configurar"}
        </button>
      </div>

      {/* ═══ Config panel (collapsible) ═══ */}
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

      {/* ═══ Compact hero: progress bar + key numbers in one row ═══ */}
      <div className="flex items-center gap-4 mb-2">
        {/* Left: period label + current/target */}
        <div className="shrink-0">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">{periodGoal.label}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tabular-nums leading-none" style={{ color: primaryColor }}>{fmt(periodGoal.current)}</span>
            <span className="text-sm text-slate-300 font-semibold">/ {fmt(periodGoal.target)}</span>
          </div>
        </div>

        {/* Center: progress bar */}
        <div className="flex-1 min-w-0">
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${periodPct}%`, background: periodPct >= 100 ? "linear-gradient(90deg, #10b981, #059669)" : `linear-gradient(90deg, ${primaryColor}, ${primaryColor}cc)` }}
            />
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[9px] text-slate-400">
              {periodRemaining > 0 ? <>Faltan <strong className="text-slate-600">{fmt(periodRemaining)}</strong></> : <strong className="text-emerald-600">Meta alcanzada</strong>}
            </span>
            <span className={`text-[9px] font-bold ${dias <= 7 ? "text-red-500" : dias <= 14 ? "text-amber-500" : "text-slate-500"}`}>
              {dias}d al 10 abr
            </span>
          </div>
        </div>

        {/* Right: percentage badge */}
        <div className="shrink-0 flex flex-col items-center">
          <span className="text-lg font-extrabold tabular-nums leading-none" style={{ color: periodPct >= 100 ? "#10b981" : primaryColor }}>
            {periodPct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* ═══ Goal metrics strip — compact ═══ */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <GoalMetric label="Meta Total" value={fmt(metaDatos)} subvalue={`${globalPct.toFixed(0)}%`} color={primaryColor} />
        <GoalMetric label="Meta / Dia" value={fmt(metaDiaria)} subvalue={`${fmt(periodDatos)} hoy`} color="#2563eb" />
        <GoalMetric label="Meta / Brig / Dia" value={fmt(metaPorBrigDia)} color="#7c3aed" />
        <GoalMetric label="Meta / Brig Total" value={fmt(metaPorBrigTotal)} color="#059669" />
      </div>

      {/* ═══ Global progress (compact, always visible) ═══ */}
      {period !== "all" && (
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 bg-slate-50/80 rounded-lg border border-slate-100">
          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">Global</span>
          <div className="flex-1 h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${globalPct}%`, backgroundColor: primaryColor }}
            />
          </div>
          <span className="text-[10px] font-bold tabular-nums" style={{ color: primaryColor }}>{fmt(totalDatos)}</span>
          <span className="text-[9px] text-slate-300">/ {fmt(metaDatos)}</span>
          <span className="text-[10px] font-bold tabular-nums" style={{ color: globalPct >= 100 ? "#10b981" : primaryColor }}>{globalPct.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

/* ========== Sub-components ========== */

function GoalMetric({ label, value, subvalue, color }: { label: string; value: string; subvalue?: string; color: string }) {
  return (
    <div className="flex flex-col px-3 py-2.5 bg-slate-50/60 rounded-xl border border-slate-100">
      <span className="text-[16px] font-extrabold tabular-nums leading-tight" style={{ color }}>{value}</span>
      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider mt-1">{label}</span>
      {subvalue && <span className="text-[9px] text-slate-300 mt-0.5 tabular-nums">{subvalue}</span>}
    </div>
  );
}

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
