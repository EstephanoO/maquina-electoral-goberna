interface Props {
  label: string;
  pct: number;
  color?: string;
}

function colorByPct(pct: number): string {
  if (pct >= 70) return "#4ade80";
  if (pct >= 40) return "#fbbf24";
  return "#ef4444";
}

export function MetricBar({ label, pct, color }: Props) {
  const c = color ?? colorByPct(pct);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-[9px] uppercase tracking-wider text-white/30 font-semibold">
          {label}
        </span>
        <span className="text-[10px] font-black tabular-nums" style={{ color: c }}>
          {clamped}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${clamped}%`, backgroundColor: c }}
        />
      </div>
    </div>
  );
}
