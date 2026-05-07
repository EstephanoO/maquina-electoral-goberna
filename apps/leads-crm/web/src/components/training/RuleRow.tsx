import { Power, Pencil, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Rule } from "../../types/training";
import { RuleSourceBadge } from "./RuleSourceBadge";

type Props = {
  r: Rule;
  onToggle: (r: Rule) => void;
  onEdit: (r: Rule) => void;
  onDelete: (r: Rule) => void;
};

export function RuleRow({ r, onToggle, onEdit, onDelete }: Props) {
  return (
    <tr className={cn("border-t border-slate-100 hover:bg-slate-50", !r.enabled && "opacity-50")}>
      <td className="px-3 py-2">
        <button onClick={() => onToggle(r)} title={r.enabled ? "Desactivar" : "Activar"}>
          <Power className={cn("w-4 h-4", r.enabled ? "text-emerald-500" : "text-slate-300")} />
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{r.name}</span>
          <RuleSourceBadge source={r.source} />
        </div>
        {r.description && <div className="text-[11px] text-slate-500">{r.description}</div>}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-slate-600 max-w-md truncate" title={r.pattern}>
        {r.pattern}
      </td>
      <td className="px-3 py-2">
        <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">
          {r.tag}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono text-slate-600">{r.hits_count}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          <button onClick={() => onEdit(r)} className="p-1 hover:bg-slate-200 rounded" title="Editar">
            <Pencil className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button onClick={() => onDelete(r)} className="p-1 hover:bg-red-100 rounded" title="Eliminar">
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      </td>
    </tr>
  );
}
