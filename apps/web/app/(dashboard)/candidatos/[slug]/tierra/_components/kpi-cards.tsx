"use client";

import { useTheme } from "@/lib/theme-context";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return null;
  const width = 180;
  const height = 42;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const coords = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * (height - 6) - 3;
    return { x, y, value };
  });
  const points = coords.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPath = `M ${coords.map(({ x, y }) => `${x} ${y}`).join(" L ")} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="42" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="72%" stopColor={color} stopOpacity="0.08" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-fill-${color.replace(/[^a-zA-Z0-9]/g, "")})`} />
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      {coords.map(({ value, x, y }) => <circle key={`${value}-${x}-${y}`} cx={x} cy={y} r="2" fill={color} />)}
    </svg>
  );
}

/* ========== KPI Card with comparison delta ========== */

export function KpiCard({ label, value, color, delta, deltaLabel, subtitle, icon }: {
  label: string; value: number; color: string;
  delta?: number | null; deltaLabel?: string;
  subtitle?: string; icon: React.ReactNode;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const showDelta = delta !== undefined && delta !== null;
  const isPositive = (delta ?? 0) >= 0;
  const microValues = [Math.max(value * 0.42, 1), Math.max(value * 0.56, 1), Math.max(value * 0.74, 1), Math.max(value * 0.9, 1), Math.max(value, 1)];
  const darkPalette = {
    text: "#f8fafc",
    rise: "#38d97a",
    fall: "#ff6b6b",
    leftBorder: "#facc15",
  } as const;
  const microColor = isDark ? (isPositive ? darkPalette.rise : darkPalette.fall) : color;

  return (
    <div className={`relative px-3.5 py-3 rounded-xl overflow-hidden ${isDark ? "bg-[#090D15] border border-slate-800" : "bg-white border border-slate-200/60"}`} style={{ boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="flex items-center" style={{ color: isDark ? darkPalette.text : color }}>{icon}</span>
        {showDelta ? (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isPositive ? (isDark ? "text-yellow-200 bg-yellow-400/10" : "text-emerald-600 bg-emerald-50") : (isDark ? "text-white bg-white/10" : "text-red-500 bg-red-50")}`}>
            {isPositive ? "+" : ""}{delta}%
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[26px] font-black leading-tight tabular-nums" style={{ color: isDark ? darkPalette.text : color }}>{value}</div>
          <div className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: isDark ? darkPalette.text : undefined }}>{label}</div>
          {showDelta && deltaLabel ? (
            <div className={`text-[9px] font-semibold mt-0.5 ${isDark ? "text-slate-300" : "text-slate-400"}`}>vs {deltaLabel}</div>
          ) : null}
          {subtitle && !showDelta ? <div className={`text-[9px] font-semibold mt-0.5 truncate ${isDark ? "text-slate-300" : "text-slate-400"}`}>{subtitle}</div> : null}
        </div>
        <div className="w-[140px] shrink-0" aria-hidden="true">
          <Sparkline values={microValues} color={microColor} />
        </div>
      </div>
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
