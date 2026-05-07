type Color = "blue" | "purple" | "slate" | "emerald";

const DOT: Record<Color, string> = {
  blue: "bg-blue-400",
  purple: "bg-purple-400",
  slate: "bg-slate-400",
  emerald: "bg-emerald-400",
};
const PILL: Record<Color, string> = {
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
  slate: "bg-slate-50 text-slate-700",
  emerald: "bg-emerald-50 text-emerald-700",
};

type Props = { label: string; count: number; hits?: number; color?: Color };

export function RuleGroup({ label, count, hits = 0, color = "slate" }: Props) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${DOT[color]}`} />
        <span className="text-sm text-slate-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${PILL[color]}`}>{count}</span>
        {hits > 0 && <span className="text-[10px] text-slate-400">{hits.toLocaleString()} hits</span>}
      </div>
    </div>
  );
}
