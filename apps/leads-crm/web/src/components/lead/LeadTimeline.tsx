import { MessageSquare, ShoppingBag, FileText, Bot } from "lucide-react";
import type { Interaction } from "../../types";

type Props = { interactions: Interaction[] };

export function LeadTimeline({ interactions }: Props) {
  if (interactions.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-3">Actividad</div>
        <div className="text-xs text-slate-400 italic text-center py-4">Sin actividad registrada</div>
      </section>
    );
  }

  const sorted = [...interactions].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-3">
        Actividad ({sorted.length})
      </div>
      <ul className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {sorted.slice(0, 60).map(i => <TimelineRow key={i.id} i={i} />)}
      </ul>
    </section>
  );
}

function TimelineRow({ i }: { i: Interaction }) {
  const icon = getIcon(i.kind);
  const isBot = (i.meta as any)?.auto_reply === true;
  const ts = new Date(i.created_at).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <li className="flex gap-3 group">
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${kindColor(i.kind)}`}>
          {icon}
        </div>
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-700">{kindLabel(i.kind)}</span>
          {isBot && (
            <span className="text-[10px] font-mono bg-purple-50 text-purple-700 px-1 rounded flex items-center gap-1">
              <Bot size={10} /> bot
            </span>
          )}
          <span className="text-[11px] text-slate-400">{ts}</span>
        </div>
        {i.body && (
          <div className="text-xs text-slate-600 mt-0.5 line-clamp-3 whitespace-pre-wrap break-words">
            {i.body}
          </div>
        )}
      </div>
    </li>
  );
}

function getIcon(kind: string) {
  switch (kind) {
    case "purchase": return <ShoppingBag size={14} />;
    case "stage_change": return <FileText size={14} />;
    default: return <MessageSquare size={14} />;
  }
}
function kindColor(kind: string): string {
  switch (kind) {
    case "message_in":   return "bg-blue-100 text-blue-700";
    case "message_out":  return "bg-emerald-100 text-emerald-700";
    case "purchase":     return "bg-amber-100 text-amber-700";
    case "stage_change": return "bg-slate-100 text-slate-700";
    case "note":         return "bg-violet-100 text-violet-700";
    default:             return "bg-slate-100 text-slate-700";
  }
}
function kindLabel(kind: string): string {
  switch (kind) {
    case "message_in":   return "Mensaje recibido";
    case "message_out":  return "Mensaje enviado";
    case "purchase":     return "Compra";
    case "stage_change": return "Cambio de etapa";
    case "note":         return "Nota";
    case "lead_created": return "Lead creado";
    default:             return kind;
  }
}
