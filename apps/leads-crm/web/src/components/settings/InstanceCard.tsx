import { Phone, Edit2, Copy, Power, AlertCircle } from "lucide-react";
import type { BotInstance } from "../../types/config";

type Props = {
  instance: BotInstance;
  onEdit: () => void;
  onCopyTo: () => void;
};

export function InstanceCard({ instance, onEdit, onCopyTo }: Props) {
  return (
    <div className={`rounded-lg border p-4 ${instance.enabled ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70"}`}>
      <header className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded uppercase">{instance.slug}</span>
            <h3 className="font-semibold text-slate-900">{instance.display_name}</h3>
          </div>
          {instance.phone && (
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
              <Phone size={12} /> {instance.phone}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={onCopyTo} title="Copiar config a otro instance"
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded">
            <Copy size={14} />
          </button>
          <button onClick={onEdit} title="Editar"
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded">
            <Edit2 size={14} />
          </button>
        </div>
      </header>

      <dl className="space-y-1.5 text-xs">
        <Row k="Agente" v={instance.agent_name} />
        {instance.agent_signature && <Row k="Firma" v={instance.agent_signature} />}
        <Row k="Productos" v={instance.product_skus?.length ? `${instance.product_skus.length} custom` : "Todos los featured"} />
        <Row k="Reglas" v={instance.rule_ids?.length ? `${instance.rule_ids.length} custom` : "Todas activas"} />
        <Row k="Yape" v={instance.yape_numero ?? "—"} />
      </dl>

      <footer className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 text-xs">
        <span className={`flex items-center gap-1 ${instance.enabled ? "text-emerald-600" : "text-slate-400"}`}>
          <Power size={12} /> {instance.enabled ? "Activo" : "Apagado"}
        </span>
        <span className={`flex items-center gap-1 ${instance.auto_reply ? "text-amber-600" : "text-slate-400"}`}>
          <AlertCircle size={12} /> Auto-reply {instance.auto_reply ? "ON" : "OFF"}
        </span>
      </footer>

      {instance.notes && (
        <div className="mt-2 text-[11px] text-slate-500 italic">{instance.notes}</div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex">
      <dt className="text-slate-500 w-20 shrink-0">{k}:</dt>
      <dd className="text-slate-700 truncate">{v}</dd>
    </div>
  );
}
