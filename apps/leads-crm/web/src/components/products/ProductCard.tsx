import { Star } from "lucide-react";
import type { Product } from "../../types/product";
import { ProductThumb } from "./ProductThumb";
import { ProductMeta } from "./ProductMeta";
import { ClassifierBadge } from "./ClassifierBadge";
import { ProductCardActions } from "./ProductCardActions";

type Props = {
  p: Product;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
};

export function ProductCard({ p, onEdit, onDelete }: Props) {
  return (
    <div
      className={`border rounded-lg p-4 bg-white relative ${!p.enabled ? "opacity-50" : ""} ${p.featured ? "border-blue-200" : "border-slate-200"}`}
    >
      {p.featured && (
        <div className="absolute top-2 right-2 text-yellow-500" title="Destacado">
          <Star size={16} fill="currentColor" />
        </div>
      )}

      <header className="flex items-start gap-3 mb-3">
        <ProductThumb url={p.imagen_url} nombre={p.nombre} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 leading-tight">{p.nombre}</div>
          {p.sku && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.sku}</div>}
        </div>
      </header>

      {p.descripcion && (
        <p className="text-xs text-slate-600 mb-3 line-clamp-2">{p.descripcion}</p>
      )}

      <ProductMeta p={p} />
      <ClassifierBadge tag={p.rule_tag ?? p.classifier_tag} pattern={p.rule_pattern ?? p.classifier_pattern} />
      <ProductCardActions p={p} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
    </div>
  );
}
