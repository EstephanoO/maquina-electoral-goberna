import { Calendar, Clock, DollarSign } from "lucide-react";
import type { Product } from "../../types/product";

export function ProductMeta({ p }: { p: Product }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
      {p.precio_soles && <Item icon={DollarSign} text={`S/ ${p.precio_soles}`} colorClass="text-green-600" />}
      {p.precio_dolares && <Item icon={DollarSign} text={`$ ${p.precio_dolares}`} colorClass="text-green-600" />}
      {p.fecha_inicio && (
        <div className="flex items-center gap-1 text-slate-700 col-span-2">
          <Calendar size={12} className="text-blue-500" />
          {new Date(p.fecha_inicio).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
          {p.dias_semana && <span className="text-slate-500"> · {p.dias_semana}</span>}
        </div>
      )}
      {p.horario && (
        <div className="flex items-center gap-1 text-slate-700 col-span-2 truncate">
          <Clock size={12} className="text-purple-500" />
          {p.horario}
        </div>
      )}
      {p.horas_academicas && <div className="text-slate-500">{p.horas_academicas}</div>}
      <div className="text-slate-500 capitalize">{p.modalidad}</div>
    </div>
  );
}

type ItemProps = { icon: any; text: string; colorClass?: string };
function Item({ icon: Icon, text, colorClass = "" }: ItemProps) {
  return (
    <div className="flex items-center gap-1 text-slate-700">
      <Icon size={12} className={colorClass} />
      {text}
    </div>
  );
}
