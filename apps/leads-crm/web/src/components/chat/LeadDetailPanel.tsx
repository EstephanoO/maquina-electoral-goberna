import {
  Crown, Award, ShoppingBag, Calendar, AlertCircle, Users,
  Phone, Mail, Globe, Briefcase, IdCard, FileText, Tag,
  TrendingUp, CheckCircle2, X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { QK } from "../../lib/query-client";
import { formatMoney, STAGE_CONFIG, TIER_CONFIG } from "../../lib/utils";
import type { Lead } from "../../types";
import { useResolveAttention } from "../../hooks/useResolveAttention";

type FullLead = Lead & {
  dni?: string | null;
  ocupacion?: string | null;
  fecha_nacimiento?: string | null;
  last_course?: string | null;
  enrollments_count?: number;
  certificates_count?: number;
  escuela_client_id?: number | null;
  is_group?: boolean;
  group_subject?: string | null;
  needs_human_attention?: boolean;
  attention_reason?: string | null;
  attention_at?: string | null;
  source?: string;
  first_purchase_at?: string | null;
  last_purchase_year?: number | null;
};

type Props = {
  leadId: number | null;
  onClose?: () => void;
};

export function LeadDetailPanel({ leadId, onClose }: Props) {
  const q = useQuery({
    queryKey: leadId ? QK.lead(leadId) : ["lead", "none"],
    queryFn: () => api.get<FullLead>(`/leads/${leadId}`),
    enabled: !!leadId,
  });
  const { resolve, resolving } = useResolveAttention();

  if (!leadId) return null;
  if (q.isLoading) return <PanelSkeleton onClose={onClose} />;
  if (!q.data)    return <Empty msg="Sin información" onClose={onClose} />;

  const lead = q.data;
  const placeholder = !lead.name || /^\+?\d+$/.test(lead.name);
  const tierCfg = lead.buyer_tier ? TIER_CONFIG[lead.buyer_tier as keyof typeof TIER_CONFIG] : null;
  const stageCfg = STAGE_CONFIG[lead.stage as keyof typeof STAGE_CONFIG];
  const tags = (lead.tags || []).filter(Boolean);
  const tagsByPrefix = groupTagsByPrefix(tags);

  return (
    <aside className="flex flex-col h-full w-full md:w-96 border-l border-slate-200 bg-slate-50 overflow-hidden">
      <PanelHeader name={placeholder ? "Sin nombre" : lead.name} placeholder={placeholder} onClose={onClose} />

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {lead.needs_human_attention && (
          <AttentionBanner
            reason={lead.attention_reason}
            at={lead.attention_at}
            resolving={resolving}
            onResolve={() => resolve(lead.id)}
          />
        )}

        {lead.is_group && (
          <Banner icon={Users} color="violet" text={`Grupo: ${lead.group_subject || "(sin nombre)"}`} />
        )}

        {/* IDENTIDAD */}
        <Card title="Contacto">
          <KV icon={Phone} label="Teléfono" value={lead.phone || "—"} mono />
          {lead.email           && <KV icon={Mail} label="Email"      value={lead.email} />}
          {lead.country         && <KV icon={Globe} label="País"      value={lead.country} />}
          {lead.dni             && <KV icon={IdCard} label="DNI"       value={lead.dni} mono />}
          {lead.ocupacion       && <KV icon={Briefcase} label="Ocupación" value={lead.ocupacion} />}
          {lead.fecha_nacimiento && (
            <KV icon={Calendar} label="Nacimiento"
                value={new Date(lead.fecha_nacimiento).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })} />
          )}
        </Card>

        {/* PIPELINE + TIER */}
        <Card title="Pipeline">
          <div className="flex items-center gap-2 flex-wrap">
            {stageCfg && (
              <span className={`px-2 py-1 rounded text-[11px] font-medium ${stageCfg.color}`}>
                {stageCfg.label}
              </span>
            )}
            {tierCfg && (
              <span className={`px-2 py-1 rounded text-[11px] font-medium ${tierCfg.color}`}>
                {tierCfg.label}
              </span>
            )}
            {lead.buyer_tier === "vip" && (
              <span className="flex items-center gap-1 text-[11px] text-amber-700">
                <Crown size={12} fill="currentColor" /> VIP
              </span>
            )}
          </div>
        </Card>

        {/* HISTORIAL DE COMPRAS */}
        {(Number(lead.total_usd_spent) > 0 || (lead.n_purchases || 0) > 0 || lead.escuela_client_id) && (
          <Card title="Historial Goberna Escuela" highlight={!!lead.escuela_client_id}>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <Stat icon={ShoppingBag} label="Compras"    value={String(lead.n_purchases || 0)} />
              <Stat icon={Award}       label="Certif."    value={String(lead.certificates_count || 0)} />
              <Stat icon={CheckCircle2} label="Inscrip."  value={String(lead.enrollments_count || 0)} />
            </div>
            <KV icon={TrendingUp} label="Total gastado"
                value={formatMoney(Number(lead.total_usd_spent || 0))} accent />
            {lead.last_course && <KV icon={FileText} label="Último curso" value={lead.last_course} />}
            {lead.first_purchase_at && (
              <KV icon={Calendar} label="Primera compra"
                  value={new Date(lead.first_purchase_at).toLocaleDateString("es-PE", { month: "short", year: "numeric" })} />
            )}
            {lead.last_purchase_year && (
              <KV icon={Calendar} label="Última compra" value={String(lead.last_purchase_year)} />
            )}
            {lead.escuela_client_id && (
              <KV icon={IdCard} label="ID ERP" value={`#${lead.escuela_client_id}`} mono />
            )}
          </Card>
        )}

        {/* TAGS / CATEGORÍAS */}
        {tags.length > 0 && (
          <Card title={`Categorías y etiquetas (${tags.length})`}>
            {Object.entries(tagsByPrefix).map(([prefix, items]) => (
              <div key={prefix} className="mb-2 last:mb-0">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  {humanizePrefix(prefix)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {items.map((t, i) => (
                    <span key={i} className={`text-[11px] px-2 py-0.5 rounded font-medium ${prefixColor(prefix)}`}>
                      {t.replace(/^[^:]+:/, "")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* META */}
        <Card title="Origen">
          {lead.source && <KV icon={Tag} label="Source" value={lead.source} mono />}
          {lead.created_at && (
            <KV icon={Calendar} label="Creado"
                value={new Date(lead.created_at).toLocaleDateString("es-PE")} />
          )}
        </Card>
      </div>
    </aside>
  );
}

// ── helpers ────────────────────────────────────────────────────────

function groupTagsByPrefix(tags: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of tags) {
    const m = t.match(/^([^:]+):/);
    const prefix = m ? m[1] : "otros";
    if (!out[prefix]) out[prefix] = [];
    out[prefix].push(t);
  }
  return out;
}

function humanizePrefix(p: string): string {
  return ({
    "interés":   "Intereses",
    "interes":   "Intereses",
    "producto":  "Productos",
    "intent":    "Intenciones",
    "consulta":  "Consultas",
    "pago":      "Pago",
    "sector":    "Sector",
    "cliente":   "Cliente",
    "país":      "País",
    "pais":      "País",
    "profesion": "Profesión",
    "otros":     "Otros",
  } as Record<string, string>)[p] ?? p;
}

function prefixColor(p: string): string {
  return ({
    "interés":   "bg-purple-100 text-purple-700",
    "interes":   "bg-purple-100 text-purple-700",
    "producto":  "bg-blue-100 text-blue-700",
    "intent":    "bg-amber-100 text-amber-700",
    "consulta":  "bg-cyan-100 text-cyan-700",
    "pago":      "bg-emerald-100 text-emerald-700",
    "sector":    "bg-violet-100 text-violet-700",
    "cliente":   "bg-rose-100 text-rose-700",
    "país":      "bg-sky-100 text-sky-700",
    "pais":      "bg-sky-100 text-sky-700",
    "profesion": "bg-orange-100 text-orange-700",
  } as Record<string, string>)[p] ?? "bg-slate-100 text-slate-700";
}

// ── primitives ─────────────────────────────────────────────────────

function PanelHeader({ name, placeholder, onClose }: { name: string; placeholder: boolean; onClose?: () => void }) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
      <h3 className={`text-sm font-bold truncate ${placeholder ? "text-slate-400 italic" : "text-slate-800"}`}>
        {name}
      </h3>
      {onClose && (
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 md:hidden">
          <X size={16} />
        </button>
      )}
    </header>
  );
}

function Card({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <section className={`rounded-lg border p-3 space-y-1.5 ${highlight ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      {children}
    </section>
  );
}

function KV({ icon: Icon, label, value, mono, accent }: { icon: any; label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <Icon size={11} className="text-slate-400 shrink-0 mt-0.5" />
      <span className="text-slate-500 w-20 shrink-0 text-[11px]">{label}</span>
      <span className={`flex-1 truncate ${mono ? "font-mono text-[11px]" : ""} ${accent ? "font-bold text-emerald-700 text-sm" : "text-slate-800 font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="text-center bg-slate-50 rounded p-1.5">
      <Icon className="inline w-3 h-3 text-slate-500" />
      <div className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}

function AttentionBanner({ reason, at, resolving, onResolve }: { reason?: string | null; at?: string | null; resolving: boolean; onResolve: () => void }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs text-amber-900">
          <div className="font-bold">Atención humana pendiente</div>
          {reason && <div className="text-amber-800 mt-0.5 line-clamp-2">{reason}</div>}
          {at && <div className="text-[10px] text-amber-700/80 mt-1">{new Date(at).toLocaleString("es-PE")}</div>}
        </div>
      </div>
      <button
        onClick={onResolve}
        disabled={resolving}
        className="mt-2 w-full flex items-center justify-center gap-1 text-xs bg-emerald-600 text-white py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50"
      >
        <CheckCircle2 size={13} /> {resolving ? "Resolviendo…" : "Resolver atención"}
      </button>
    </div>
  );
}

function Banner({ icon: Icon, color, text }: { icon: any; color: "violet"; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-violet-50 border-violet-200 text-violet-800 p-2 text-xs">
      <Icon size={14} className="shrink-0 mt-0.5" />
      <span className="font-medium">{text}</span>
    </div>
  );
}

function Empty({ msg, onClose }: { msg: string; onClose?: () => void }) {
  return (
    <aside className="hidden md:flex w-96 border-l border-slate-200 bg-slate-50 items-center justify-center text-xs text-slate-400 italic">
      {msg}
      {onClose && <button onClick={onClose} className="ml-2 text-slate-400"><X size={14} /></button>}
    </aside>
  );
}

function PanelSkeleton({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="flex flex-col w-96 border-l border-slate-200 bg-slate-50 p-3 gap-2">
      <PanelHeader name="…" placeholder onClose={onClose} />
      <div className="h-20 bg-slate-200/50 rounded animate-pulse" />
      <div className="h-32 bg-slate-200/50 rounded animate-pulse" />
      <div className="h-24 bg-slate-200/50 rounded animate-pulse" />
    </aside>
  );
}
