import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { STAGE_CONFIG } from "../../lib/utils";

type Stage = keyof typeof STAGE_CONFIG;
const ORDER: Stage[] = ["contacted", "interested", "sold", "delivered", "follow_up", "recontact", "resold", "lost"];

type Props = {
  current: string;
  onChange?: (s: Stage) => void;
  history?: Array<{ stage: string; at: string }>;  // optional transitions
};

export function PipelineStepper({ current, onChange, history = [] }: Props) {
  const idx = ORDER.indexOf(current as Stage);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Pipeline</div>
        <div className="text-[10px] text-slate-400">
          {idx + 1} de {ORDER.length}
        </div>
      </div>

      {/* Horizontal stepper */}
      <div className="relative">
        {/* Background track */}
        <div className="absolute top-3.5 left-3 right-3 h-0.5 bg-slate-200 rounded-full" />

        {/* Progress fill */}
        {idx > 0 && (
          <div
            className="absolute top-3.5 left-3 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `calc(${(idx / (ORDER.length - 1)) * 100}% - 24px)` }}
          />
        )}

        {/* Steps */}
        <div className="relative flex items-start justify-between">
          {ORDER.map((s, i) => {
            const cfg = STAGE_CONFIG[s];
            const past = i < idx;
            const here = i === idx;
            const future = i > idx;
            const ts = history.find(h => h.stage === s)?.at;

            return (
              <button
                key={s}
                onClick={() => onChange?.(s)}
                className="group relative flex flex-col items-center gap-1.5 z-10 cursor-pointer"
                style={{ width: `${100 / ORDER.length}%` }}
                title={cfg.label}
              >
                {/* Dot */}
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300",
                  past   && "bg-emerald-500 text-white shadow-sm group-hover:scale-110",
                  here   && "bg-blue-600 text-white ring-4 ring-blue-100 shadow-md scale-110 animate-[pulse-soft_2s_ease-in-out_infinite]",
                  future && "bg-white border-2 border-slate-300 text-slate-400 group-hover:border-slate-400 group-hover:scale-110",
                )}>
                  {past ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : (
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  )}
                </div>

                {/* Label */}
                <div className="text-center px-0.5 max-w-full">
                  <div className={cn(
                    "text-[10px] font-medium truncate transition-colors",
                    past   && "text-emerald-700",
                    here   && "text-blue-700 font-bold",
                    future && "text-slate-400 group-hover:text-slate-600",
                  )}>
                    {cfg.label.replace(/^[^\w\s]+\s/, "")}
                  </div>
                  {ts && past && (
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      {new Date(ts).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
