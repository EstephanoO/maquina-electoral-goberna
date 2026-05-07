import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { useLeadFacets } from "../../hooks/useRecommendations";
import { Field, TextInput } from "../forms/Field";

type Filter = {
  buyer_tier?: { in: string[] };
  stage?: { in: string[] };
  country?: string;
  n_purchases?: { gte?: number; lte?: number };
  last_purchase_year?: { gte?: number; lte?: number };
  days_since_contact?: { gte?: number; lte?: number };
  tags?: { contains: string };
  has_phone?: boolean;
};

type Props = {
  value: Filter;
  onChange: (f: Filter) => void;
};

const TIER_OPTIONS = ["vip", "repeat", "single", "prospect"];
const STAGE_OPTIONS = ["contacted", "interested", "sold", "delivered", "follow_up", "recontact", "resold", "lost"];

export function AdvancedFilterBuilder({ value, onChange }: Props) {
  const facets = useLeadFacets();
  const [local, setLocal] = useState<Filter>(value);

  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => { onChange(local); }, [local]);  // eslint-disable-line

  function toggleArr(key: "buyer_tier" | "stage", item: string) {
    setLocal(prev => {
      const cur = prev[key]?.in ?? [];
      const next = cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item];
      return { ...prev, [key]: next.length > 0 ? { in: next } : undefined };
    });
  }

  function clearAll() { setLocal({ has_phone: true }); }

  const activeCount = Object.keys(local).filter(k => k !== "has_phone").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Filter className="w-3.5 h-3.5" /> Filtros avanzados
          {activeCount > 0 && (
            <span className="badge bg-blue-100 text-blue-700">{activeCount} activos</span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-[10px] text-slate-500 hover:text-red-600 flex items-center gap-1">
            <X size={11} /> Limpiar
          </button>
        )}
      </div>

      {/* Tier multi-select */}
      <Field label="Buyer tier (multi)">
        <div className="flex flex-wrap gap-1.5">
          {TIER_OPTIONS.map(t => {
            const active = local.buyer_tier?.in?.includes(t);
            const count = facets.data?.tiers.find(x => x.tier === t)?.n;
            return (
              <button
                key={t}
                onClick={() => toggleArr("buyer_tier", t)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  active ? "bg-[#1B365D] text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t} {count !== undefined && <span className="opacity-70 ml-1">({count})</span>}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Stage multi-select */}
      <Field label="Stage del pipeline (multi)">
        <div className="flex flex-wrap gap-1.5">
          {STAGE_OPTIONS.map(s => {
            const active = local.stage?.in?.includes(s);
            const count = facets.data?.stages.find(x => x.stage === s)?.n;
            return (
              <button
                key={s}
                onClick={() => toggleArr("stage", s)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                  active ? "bg-[#1B365D] text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {s} {count !== undefined && <span className="opacity-70 ml-1">({count})</span>}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Country */}
      <Field label="País">
        <select
          value={local.country ?? ""}
          onChange={(e) => setLocal({ ...local, country: e.target.value || undefined })}
          className="input-field"
        >
          <option value="">— Todos —</option>
          {facets.data?.countries.map(c => (
            <option key={c.country} value={c.country}>{c.country} ({c.n})</option>
          ))}
        </select>
      </Field>

      {/* Days since contact */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Días sin contacto ≥">
          <TextInput
            type="number" min={0}
            value={local.days_since_contact?.gte ?? ""}
            onChange={(e) => setLocal({
              ...local,
              days_since_contact: { ...local.days_since_contact, gte: e.target.value ? Number(e.target.value) : undefined },
            })}
          />
        </Field>
        <Field label="Días sin contacto ≤">
          <TextInput
            type="number" min={0}
            value={local.days_since_contact?.lte ?? ""}
            onChange={(e) => setLocal({
              ...local,
              days_since_contact: { ...local.days_since_contact, lte: e.target.value ? Number(e.target.value) : undefined },
            })}
          />
        </Field>
      </div>

      {/* Tag */}
      <Field label="Tag específico (interés, producto, intent…)">
        <select
          value={local.tags?.contains ?? ""}
          onChange={(e) => setLocal({ ...local, tags: e.target.value ? { contains: e.target.value } : undefined })}
          className="input-field"
        >
          <option value="">— Cualquier tag —</option>
          {facets.data?.tags.slice(0, 30).map(t => (
            <option key={t.tag} value={t.tag}>{t.tag} ({t.n})</option>
          ))}
        </select>
      </Field>

      {/* Last purchase year */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Compró en o después de">
          <TextInput
            type="number" placeholder="2024" min={2018} max={2030}
            value={local.last_purchase_year?.gte ?? ""}
            onChange={(e) => setLocal({
              ...local,
              last_purchase_year: { ...local.last_purchase_year, gte: e.target.value ? Number(e.target.value) : undefined },
            })}
          />
        </Field>
        <Field label="Compró antes de">
          <TextInput
            type="number" placeholder="2025" min={2018} max={2030}
            value={local.last_purchase_year?.lte ?? ""}
            onChange={(e) => setLocal({
              ...local,
              last_purchase_year: { ...local.last_purchase_year, lte: e.target.value ? Number(e.target.value) : undefined },
            })}
          />
        </Field>
      </div>
    </div>
  );
}
