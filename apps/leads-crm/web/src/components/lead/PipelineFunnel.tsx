import { STAGE_CONFIG } from "../../lib/utils";

type Stage = keyof typeof STAGE_CONFIG;
const ORDER: Stage[] = ["contacted", "interested", "sold", "delivered", "follow_up", "recontact", "resold", "lost"];

type Props = {
  current: string;
  onChange?: (s: Stage) => void;
};

export function PipelineFunnel({ current, onChange }: Props) {
  const idx = ORDER.indexOf(current as Stage);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">Embudo</div>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {ORDER.map((s, i) => {
          const cfg = STAGE_CONFIG[s];
          const past = i < idx;
          const here = i === idx;
          return (
            <button
              key={s}
              onClick={() => onChange?.(s)}
              className={`flex-1 min-w-[80px] px-2 py-2 rounded text-[11px] font-medium border transition ${
                here
                  ? `${cfg.color} border-current ring-2 ring-current/20`
                  : past
                    ? "bg-slate-100 text-slate-500 border-slate-200"
                    : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
              }`}
              title={cfg.label}
            >
              <div className="truncate">{cfg.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
