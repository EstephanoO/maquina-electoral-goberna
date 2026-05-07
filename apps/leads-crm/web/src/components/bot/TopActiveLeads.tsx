import { Crown, AlertCircle, ArrowDown, ArrowUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTopActiveLeads } from "../../hooks/useBotActivityExtras";
import { Avatar } from "../ui";

export function TopActiveLeads() {
  const navigate = useNavigate();
  const { data } = useTopActiveLeads();
  const items = data ?? [];

  return (
    <div className="card p-5">
      <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        🔥 Top 10 leads más activos hoy
      </h2>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 py-3">Sin actividad</div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {items.map(l => (
            <button
              key={l.id}
              onClick={() => navigate(`/leads/${l.id}`)}
              className="w-full flex items-center gap-2.5 p-2 rounded-md hover:bg-slate-50 border border-transparent hover:border-slate-200 transition text-left"
            >
              <Avatar name={l.name || l.phone} size="sm" ring={l.buyer_tier === "vip" ? "vip" : null} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {l.buyer_tier === "vip" && <Crown className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" />}
                  <span className="text-xs font-semibold text-slate-800 truncate">{l.name || l.phone}</span>
                  {l.needs_human_attention && (
                    <span className="badge bg-amber-100 text-amber-800 gap-0.5">
                      <AlertCircle className="w-2.5 h-2.5" /> {l.attention_reason?.slice(0, 22)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                  {l.country && <span>{l.country}</span>}
                  <span>· {l.stage}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono tabular-nums">
                <span className="flex items-center gap-0.5 text-blue-700">
                  <ArrowDown className="w-3 h-3" /> {l.in_count}
                </span>
                <span className="flex items-center gap-0.5 text-emerald-700">
                  <ArrowUp className="w-3 h-3" /> {l.out_count}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
