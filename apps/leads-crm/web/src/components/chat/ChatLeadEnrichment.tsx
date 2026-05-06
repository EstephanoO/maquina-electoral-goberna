import { Crown, Award, ShoppingBag, Calendar, AlertCircle, Users } from "lucide-react";
import { useLeadEnrichment } from "../../hooks/useLeadEnrichment";
import { formatMoney } from "../../lib/utils";
import { TIER_CONFIG } from "../../lib/utils";

type Props = { leadId: number | null };

export function ChatLeadEnrichment({ leadId }: Props) {
  const { data, loading } = useLeadEnrichment(leadId);

  if (!leadId) return <Empty msg="Seleccioná un chat" />;
  if (loading) return <Empty msg="Cargando…" />;
  if (!data) return <Empty msg="Sin información extra" />;

  const tierCfg = data.buyer_tier ? TIER_CONFIG[data.buyer_tier as keyof typeof TIER_CONFIG] : null;
  const isHistoricCustomer = data.escuela_client_id != null;

  return (
    <aside className="w-full md:w-80 border-l border-slate-200 bg-slate-50 overflow-y-auto p-4 space-y-3">
      {data.needs_human_attention && (
        <Banner icon={AlertCircle} color="amber" text={data.attention_reason || "Necesita atención"} />
      )}

      {data.is_group && (
        <Banner icon={Users} color="violet" text={`Grupo: ${data.group_subject || "sin nombre"}`} />
      )}

      {isHistoricCustomer && (
        <section className="bg-white rounded-lg p-3 border border-amber-200">
          <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700 mb-1">
            <Crown className="inline w-3 h-3 mr-1" /> Cliente histórico Goberna Escuela
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Stat icon={ShoppingBag} label="Compras" value={String(data.n_purchases)} />
            <Stat icon={Award}       label="Certif." value={String(data.certificates_count)} />
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Total gastado: <span className="font-semibold text-emerald-700">{formatMoney(Number(data.total_usd_spent))}</span>
          </div>
          {data.last_course && (
            <div className="text-xs text-slate-600 mt-1 truncate">
              Último: <span className="text-slate-800">{data.last_course}</span>
            </div>
          )}
          {data.last_purchase_year && (
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Calendar size={11} /> Última compra {data.last_purchase_year}
            </div>
          )}
        </section>
      )}

      {tierCfg && (
        <div className="text-xs text-slate-600">
          <span className="font-medium">Tier:</span>{" "}
          <span className={`px-1.5 py-0.5 rounded ${tierCfg.color}`}>{tierCfg.label}</span>
        </div>
      )}

      {(data.dni || data.ocupacion || data.fecha_nacimiento) && (
        <section className="bg-white rounded-lg p-3 border border-slate-200 space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Datos personales</div>
          {data.dni        && <Row k="DNI" v={data.dni} />}
          {data.ocupacion  && <Row k="Ocupación" v={data.ocupacion} />}
          {data.fecha_nacimiento && <Row k="Nacimiento" v={new Date(data.fecha_nacimiento).toLocaleDateString("es-PE")} />}
        </section>
      )}
    </aside>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <aside className="hidden md:flex w-80 border-l border-slate-200 bg-slate-50 items-center justify-center text-xs text-slate-400 italic">
      {msg}
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex text-xs">
      <span className="text-slate-500 w-24 shrink-0">{k}</span>
      <span className="text-slate-800 font-medium truncate">{v}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="text-center bg-amber-50 rounded p-1.5">
      <Icon className="inline w-3 h-3 text-amber-600 mr-1" />
      <span className="text-[10px] text-amber-700">{label}</span>
      <div className="text-sm font-bold text-amber-900">{value}</div>
    </div>
  );
}

function Banner({ icon: Icon, color, text }: { icon: any; color: "amber" | "violet"; text: string }) {
  const cls = color === "amber"
    ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-violet-50 border-violet-200 text-violet-800";
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${cls}`}>
      <Icon size={14} className="shrink-0 mt-0.5" />
      <span className="font-medium">{text}</span>
    </div>
  );
}
