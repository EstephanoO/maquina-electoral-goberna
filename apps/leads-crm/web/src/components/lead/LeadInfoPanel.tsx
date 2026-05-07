import type { Lead } from "../../types";

type LeadExt = Lead & {
  dni?: string | null;
  ocupacion?: string | null;
  fecha_nacimiento?: string | null;
  last_course?: string | null;
  enrollments_count?: number;
  escuela_client_id?: number | null;
  source?: string;
};

const RowDef: Array<{ k: keyof LeadExt; label: string; format?: (v: any) => string }> = [
  { k: "phone", label: "Teléfono" },
  { k: "email", label: "Email" },
  { k: "dni", label: "DNI" },
  { k: "ocupacion", label: "Ocupación" },
  { k: "fecha_nacimiento", label: "Nacimiento", format: (v) => v ? new Date(v).toLocaleDateString("es-PE") : "" },
  { k: "country", label: "País" },
  { k: "last_course", label: "Último curso" },
  { k: "source", label: "Fuente" },
  { k: "escuela_client_id", label: "ID ERP", format: (v) => v ? `#${v}` : "" },
];

export function LeadInfoPanel({ lead }: { lead: LeadExt }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-3">Información</div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
        {RowDef.map(({ k, label, format }) => {
          const raw = (lead as any)[k];
          const v = format ? format(raw) : raw;
          if (!v) return null;
          return (
            <div key={String(k)} className="flex items-baseline gap-2 text-sm">
              <dt className="text-xs text-slate-500 w-24 shrink-0">{label}</dt>
              <dd className="text-slate-800 font-medium truncate">{v}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
