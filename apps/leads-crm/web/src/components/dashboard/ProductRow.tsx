import { CalendarClock } from "lucide-react";

export type ProductRowData = {
  id: number;
  nombre: string;
  precio_dolares?: string | null;
  precio_soles?: string | null;
  fecha_inicio?: string | null;
  rule_tag?: string | null;
};

export function ProductRow({ p }: { p: ProductRowData }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{p.nombre}</div>
        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
          {p.precio_dolares && <span>${p.precio_dolares}</span>}
          {p.precio_soles && <span>· S/{p.precio_soles}</span>}
          {p.fecha_inicio && (
            <span className="flex items-center gap-1">
              <CalendarClock size={10} />
              {new Date(p.fecha_inicio).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
            </span>
          )}
          {p.rule_tag && (
            <span className="bg-amber-50 text-amber-700 px-1 rounded text-[10px]">
              🤖 {p.rule_tag.replace(/^interés:/, "")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
