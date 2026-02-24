"use client";

/* ========== KPI Card with comparison delta ========== */

export function KpiCard({ label, value, color, delta, deltaLabel, subtitle, icon }: {
  label: string; value: number; color: string;
  delta?: number | null; deltaLabel?: string;
  subtitle?: string; icon: React.ReactNode;
}) {
  const showDelta = delta !== undefined && delta !== null;
  const isPositive = (delta ?? 0) >= 0;

  return (
    <div className="px-3.5 py-3 bg-slate-50/60 rounded-xl border border-slate-100">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center opacity-60" style={{ color }}>{icon}</span>
        {showDelta ? (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isPositive ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}>
            {isPositive ? "▲" : "▼"} {Math.abs(delta!)}%
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-extrabold leading-tight tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-1">{label}</div>
      {showDelta && deltaLabel ? (
        <div className="text-[9px] text-slate-300 mt-0.5">vs {deltaLabel}</div>
      ) : null}
      {subtitle && !showDelta ? <div className="text-[9px] text-slate-300 mt-0.5">{subtitle}</div> : null}
    </div>
  );
}

/* ========== Icons ========== */

export function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Reloj">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Grafico">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Usuarios">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function TrendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Tendencia">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
