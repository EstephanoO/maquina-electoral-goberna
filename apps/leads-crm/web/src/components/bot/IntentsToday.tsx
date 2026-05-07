import { Sparkles } from "lucide-react";
import { useIntentsToday } from "../../hooks/useBotActivityExtras";

const SOURCE_COLOR: Record<string, string> = {
  product:     "bg-blue-100 text-blue-700",
  learned_p4:  "bg-purple-100 text-purple-700",
  bot_legacy:  "bg-amber-100 text-amber-700",
  manual:      "bg-slate-100 text-slate-700",
};

export function IntentsToday() {
  const { data } = useIntentsToday();
  const items = data ?? [];

  return (
    <div className="card p-5">
      <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-500" />
        Intents detectados hoy
      </h2>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 py-3">Sin matches todavía</div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {items.map((i, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-100 last:border-0">
              <span className={`badge ${SOURCE_COLOR[i.source] ?? SOURCE_COLOR.manual}`}>{i.source}</span>
              <span className="flex-1 font-mono text-slate-700 truncate">{i.tag}</span>
              <span className="font-bold tabular-nums text-slate-800">{i.leads}</span>
              <span className="text-[10px] text-slate-400 w-12 text-right">leads</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
