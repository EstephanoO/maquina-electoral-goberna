import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

type Step = {
  key: string;
  label: string;
  done: boolean;
};

type Props = {
  steps: Step[];
  current: string;
  onJump?: (key: string) => void;
};

export function StepIndicator({ steps, current, onJump }: Props) {
  const idx = steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const past = i < idx;
        const here = i === idx;
        const future = i > idx;
        const canJump = past || s.done;

        return (
          <div key={s.key} className="flex items-center flex-1">
            <button
              onClick={() => canJump && onJump?.(s.key)}
              disabled={!canJump}
              className="flex items-center gap-2 group min-w-0"
            >
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all shrink-0",
                past   && "bg-emerald-500 text-white",
                here   && "bg-[#1B365D] text-white ring-4 ring-blue-100 scale-110",
                future && "bg-white border border-slate-300 text-slate-400",
              )}>
                {s.done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
              </div>
              <span className={cn(
                "text-xs font-medium truncate",
                past   && "text-emerald-700",
                here   && "text-[#1B365D] font-bold",
                future && "text-slate-400 group-hover:text-slate-600",
              )}>
                {s.label}
              </span>
            </button>

            {i < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2 rounded-full transition-all",
                past ? "bg-emerald-300" : "bg-slate-200"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
