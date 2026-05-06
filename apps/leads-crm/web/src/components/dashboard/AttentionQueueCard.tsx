import { AlertCircle, Check } from "lucide-react";
import { useAttentionQueue } from "../../hooks/useAttentionQueue";
import { formatWaiting } from "../../types/attention";
import { gotoView } from "../../hooks/useGoto";

export function AttentionQueueCard() {
  const { items, loading, resolve } = useAttentionQueue();

  return (
    <div className="bg-white rounded-2xl border border-amber-200 p-5 col-span-1 lg:col-span-3">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">Atención humana pendiente</div>
            <div className="text-xs text-slate-500">
              Leads que el bot no supo responder — el operador debe atender
            </div>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${items.length > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
          {items.length} {items.length === 1 ? "pendiente" : "pendientes"}
        </span>
      </header>

      {loading ? (
        <div className="text-xs text-slate-400 py-4 text-center">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-slate-400 italic py-4 text-center">
          ✨ Todo al día — el bot está respondiendo bien
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {items.slice(0, 8).map(it => (
            <button
              key={it.id}
              onClick={() => gotoView("chat")}
              className="w-full text-left flex items-start gap-3 p-2.5 rounded-md hover:bg-amber-50 border border-transparent hover:border-amber-200 transition"
            >
              <div className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                {formatWaiting(it.waiting_seconds)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">{it.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{it.phone}</span>
                </div>
                {it.last_inbound_msg && (
                  <div className="text-xs text-slate-600 line-clamp-2 mt-0.5">"{it.last_inbound_msg}"</div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); void resolve(it.id); }}
                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded shrink-0"
                title="Marcar como resuelto"
              >
                <Check size={14} />
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
