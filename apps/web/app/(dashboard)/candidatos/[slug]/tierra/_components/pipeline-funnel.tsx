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

  // ── Global progress ──
  const globalPct = metaDatos > 0 ? Math.min((totalDatos / metaDatos) * 100, 100) : 0;

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
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pipeline Global</h3>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {brigadistasGoal} brigadistas
          </span>
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

      {/* ═══ Dark Hero Card ═══ */}
      <div
        className="relative overflow-hidden rounded-2xl mb-3"
        style={{ background: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, ${primaryColor}22 100%)` }}
      >
        {/* Decorative glows */}
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20 blur-3xl" style={{ background: primaryColor }} />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10 blur-2xl" style={{ background: urgencyColor }} />

        <div className="relative flex items-center gap-5 px-5 py-4">
          {/* SVG ring */}
          <div className="relative shrink-0 w-[92px] h-[92px]">
            <svg width="92" height="92" viewBox="0 0 92 92" className="transform -rotate-90" role="img" aria-label={`${periodPct.toFixed(0)}% progreso`}>
              <title>{periodPct.toFixed(0)}% progreso</title>
              <circle cx="46" cy="46" r={ringR} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
              <circle
                cx="46" cy="46" r={ringR} fill="none"
                stroke={periodPct >= 100 ? "#10b981" : primaryColor}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={ringC} strokeDashoffset={ringOffset}
                className="transition-all duration-1000 ease-out"
                style={{ filter: `drop-shadow(0 0 6px ${periodPct >= 100 ? "#10b981" : primaryColor}80)` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-black text-white tabular-nums leading-none">{periodPct.toFixed(0)}%</span>
            </div>
          </div>

          {/* Numbers */}
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1 block">{periodGoal.label}</span>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-[32px] font-black tabular-nums leading-none text-white">{fmt(periodGoal.current)}</span>
              <span className="text-[16px] text-white/30 font-bold">/ {fmt(periodGoal.target)}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${periodPct}%`,
                  background: periodPct >= 100 ? "linear-gradient(90deg, #10b981, #059669)" : `linear-gradient(90deg, ${primaryColor}, ${primaryColor}cc)`,
                  boxShadow: `0 0 12px ${periodPct >= 100 ? "#10b981" : primaryColor}60`,
                }}
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-white/40">
                {periodRemaining > 0 ? <>Faltan <strong className="text-white/80">{fmt(periodRemaining)}</strong></> : <strong className="text-emerald-400">Meta alcanzada</strong>}
              </span>
              <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: urgencyColor }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: urgencyColor }} />
                {dias}d restantes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Goal metrics strip ═══ */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <GoalMetric label="Meta Total" value={fmt(metaDatos)} subvalue={`${globalPct.toFixed(1)}%`} color={primaryColor} />
        <GoalMetric label="Meta / Dia" value={fmt(metaDiaria)} subvalue={`${fmt(periodDatos)} hoy`} color="#2563eb" />
        <GoalMetric label="Meta / Brig / Dia" value={fmt(metaPorBrigDia)} color="#7c3aed" />
        <GoalMetric label="Meta / Brig Total" value={fmt(metaPorBrigTotal)} color="#059669" />
      </div>

      {/* ═══ Global progress ═══ */}
      {period !== "all" && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-900/[0.04] rounded-xl border border-slate-200/60">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Global</span>
          <div className="flex-1 h-2 bg-slate-200/80 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${globalPct}%`, backgroundColor: primaryColor }} />
          </div>
          <span className="text-[12px] font-extrabold tabular-nums" style={{ color: primaryColor }}>{fmt(totalDatos)}</span>
          <span className="text-[10px] text-slate-400 font-medium">/ {fmt(metaDatos)}</span>
          <span
            className="text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded-md"
            style={{ color: globalPct >= 100 ? "#059669" : primaryColor, backgroundColor: globalPct >= 100 ? "#05966910" : `${primaryColor}10` }}
          >
            {globalPct.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

/* ========== Sub-components ========== */

function GoalMetric({ label, value, subvalue, color }: { label: string; value: string; subvalue?: string; color: string }) {
  return (
    <div className="relative flex flex-col px-3 py-2.5 rounded-xl border border-slate-200/60 bg-white overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ backgroundColor: color }} />
      <span className="text-[18px] font-black tabular-nums leading-tight pl-1" style={{ color }}>{value}</span>
      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 pl-1">{label}</span>
      {subvalue && <span className="text-[10px] text-slate-500 font-semibold mt-0.5 tabular-nums pl-1">{subvalue}</span>}
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
