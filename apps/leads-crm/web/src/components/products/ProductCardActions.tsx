import { Edit2, Trash2, EyeOff, Link2 } from "lucide-react";
import type { Product } from "../../types/product";

type Props = {
  p: Product;
  onEdit: () => void;
  onDelete: () => void;
};

export function ProductCardActions({ p, onEdit, onDelete }: Props) {
  return (
    <div className="flex gap-2 pt-2 border-t border-slate-100">
      <button
        onClick={onEdit}
        className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
      >
        <Edit2 size={12} /> Editar
      </button>

      {p.enabled ? (
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2 size={12} /> Deshabilitar
        </button>
      ) : (
        <span className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400">
          <EyeOff size={12} /> Deshabilitado
        </span>
      )}

      {p.link_matricula && (
        <a
          href={p.link_matricula}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded ml-auto"
        >
          <Link2 size={12} /> Matrícula
        </a>
      )}
    </div>
  );
}
