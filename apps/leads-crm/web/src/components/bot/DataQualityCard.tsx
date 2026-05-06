import { Database, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useDataQuality } from "../../hooks/useBotActivityExtras";

export function DataQualityCard() {
  const q = useDataQuality();
  const d = q.data;

  if (!d) {
    return (
      <div className="card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-400" /> Calidad de datos
        </h2>
        <div className="text-xs text-slate-400 py-3">Cargando…</div>
      </div>
    );
  }

  const rows: Row[] = [
    { label: "Nombre real",       value: d.with_name,         total: d.total, hint: "no es el teléfono" },
    { label: "País detectado",    value: d.with_country,      total: d.total, hint: "≠ Unknown" },
    { label: "Email",             value: d.with_email,        total: d.total },
    { label: "Etapa avanzada",    value: d.with_stage,        total: d.total, hint: "≠ lead" },
    { label: "Categorías (tags)", value: d.leads_with_tags,   total: d.total },
    { label: "DNI",               value: d.with_dni,          total: d.total, hint: "extraído del chat" },
    { label: "Ocupación",         value: d.with_ocupacion,    total: d.total },
    { label: "Vínculo Escuela",   value: d.with_escuela_link, total: d.total, hint: "matched escuela.lead_360" },
    { label: "Curso comprado",    value: d.with_last_course,  total: d.total },
  ];

  const todayPct = d.engaged_today > 0
    ? {
        country: pct(d.engaged_today - d.today_no_country, d.engaged_today),
        name:    pct(d.engaged_today - d.today_no_name,    d.engaged_today),
        email:   pct(d.engaged_today - d.today_no_email,   d.engaged_today),
      }
    : null;

  return (
    <div className="card p-5">
      <h2 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
        <Database className="w-4 h-4 text-blue-500" /> Calidad de datos
      </h2>
      <p className="text-[11px] text-slate-500 mb-3">
        {d.total.toLocaleString()} leads totales (sin grupos)
      </p>

      <div className="space-y-1.5 mb-4">
        {rows.map(r => <Bar key={r.label} {...r} />)}
      </div>

      {todayPct && (
        <div className="border-t border-slate-100 pt-3 mt-3">
          <div className="text-[11px] font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
            <span>De los {d.engaged_today} que hablaron hoy</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <TodayPill label="con país"   pct={todayPct.country} missing={d.today_no_country} />
            <TodayPill label="con nombre" pct={todayPct.name}    missing={d.today_no_name} />
            <TodayPill label="con email"  pct={todayPct.email}   missing={d.today_no_email} />
          </div>
        </div>
      )}
    </div>
  );
}

type Row = { label: string; value: number; total: number; hint?: string };

function Bar({ label, value, total, hint }: Row) {
  const p = pct(value, total);
  const tone = p >= 80 ? "bg-emerald-500" : p >= 50 ? "bg-blue-500" : p >= 25 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-slate-700 font-medium">
          {label}
          {hint && <span className="text-slate-400 font-normal ml-1.5">· {hint}</span>}
        </span>
        <span className="font-mono tabular-nums text-slate-600">
          {value.toLocaleString()} <span className="text-slate-400">/ {total.toLocaleString()}</span>
          <span className="ml-1.5 font-semibold text-slate-800">{p}%</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function TodayPill({ label, pct, missing }: { label: string; pct: number; missing: number }) {
  const ok = pct >= 70;
  return (
    <div className={`rounded-lg p-2 border ${ok ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
        {ok ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-600" />}
        <span className={ok ? "text-emerald-800" : "text-amber-800"}>{label}</span>
      </div>
      <div className="text-base font-bold tabular-nums mt-0.5 text-slate-800">{pct}%</div>
      {missing > 0 && (
        <div className="text-[10px] text-slate-500">{missing} sin dato</div>
      )}
    </div>
  );
}

function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}
