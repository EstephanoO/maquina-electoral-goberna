import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  trend?: number;        // % change
  color?: string;
  className?: string;
};

export function KPI({ icon: Icon, label, value, sub, trend, color = "bg-slate-50 text-slate-600", className }: Props) {
  return (
    <div
      className={cn(
        "card p-5 hover:scale-[1.01] hover:shadow-md transition-all cursor-default",
        className,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            trend > 0 ? "bg-emerald-50 text-emerald-700" :
            trend < 0 ? "bg-red-50 text-red-700" :
                        "bg-slate-50 text-slate-500"
          )}>
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "—"} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-slate-500 font-medium mt-1">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
