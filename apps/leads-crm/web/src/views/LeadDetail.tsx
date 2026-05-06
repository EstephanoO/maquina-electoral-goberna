import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAutoSave } from "../hooks/useAutoSave";
import type { Interaction, Lead } from "../types";
import { cn, formatMoney, formatDate, STAGE_CONFIG, TIER_CONFIG } from "../lib/utils";
import { X, ShoppingBag, MessageSquare, Mail, Phone, MapPin, DollarSign } from "lucide-react";

type Props = { leadId: number; onClose: () => void; onSaved?: (l: Lead) => void; onDeleted?: () => void };

export function LeadDetail({ leadId, onClose, onSaved, onDeleted }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [activeTab, setActiveTab] = useState<"info" | "activity" | "purchases">("info");

  const { schedule, status } = useAutoSave<Partial<Lead>>(async (patch) => {
    if (!lead) return;
    const updated = await api.updateLead(lead.id, patch);
    setLead(updated);
    onSaved?.(updated);
  });

  useEffect(() => {
    api.getLead(leadId).then((l) => { setLead(l); setForm({ name: l.name, phone: l.phone, notes: l.notes }); }).catch((e) => setError(e.message));
    api.listInteractions(leadId).then(setInteractions).catch(() => {});
  }, [leadId]);

  const purchases = useMemo(() => interactions.filter((i) => i.kind === "purchase").sort((a, b) => b.created_at.localeCompare(a.created_at)), [interactions]);
  const messages = useMemo(() => interactions.filter((i) => i.kind === "message_in" || i.kind === "message_out").sort((a, b) => a.created_at.localeCompare(b.created_at)), [interactions]);

  function change(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }));
    schedule({ [key]: val }, 600);
  }

  async function deleteLead() {
    if (!lead || !confirm("¿Eliminar este lead?")) return;
    await api.deleteLead(lead.id);
    onDeleted?.();
  }

  if (error) return <Drawer onClose={onClose}><div className="p-6 text-red-500">{error}</div></Drawer>;
  if (!lead) return <Drawer onClose={onClose}><div className="p-6 text-slate-400">Cargando...</div></Drawer>;

  const isPending = !lead.name || lead.name === "Sin nombre";
  const tierCfg = lead.buyer_tier ? TIER_CONFIG[lead.buyer_tier as keyof typeof TIER_CONFIG] : null;
  const stageCfg = STAGE_CONFIG[lead.stage as keyof typeof STAGE_CONFIG];

  return (
    <Drawer onClose={onClose}>
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0",
            lead.buyer_tier === "vip" ? "bg-gradient-to-br from-amber-400 to-orange-500" :
            (lead.n_purchases || 0) > 0 ? "bg-gradient-to-br from-green-400 to-emerald-600" :
            "bg-gradient-to-br from-slate-300 to-slate-400"
          )}>
            {(isPending ? "?" : lead.name.charAt(0)).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 truncate">{isPending ? lead.phone : lead.name}</h2>
              {tierCfg && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", tierCfg.color)}>{tierCfg.label}</span>}
              {stageCfg && <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md", stageCfg.color)}>{stageCfg.label}</span>}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              {lead.country && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.country}</span>}
              {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
              {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {/* Stage Timeline */}
        <StageTimeline currentStage={lead.stage} onChangeStage={(s) => change("stage", s)} />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <Stat label="Gastado" value={`$${(lead.total_usd_spent || 0).toLocaleString()}`} color="text-green-600" />
          <Stat label="Compras" value={String(lead.n_purchases || 0)} />
          <Stat label="Mensajes" value={String(messages.length)} />
          <Stat label="Actividad" value={String(interactions.length)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {(["info", "purchases", "activity"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={cn("flex-1 py-3 text-xs font-semibold uppercase tracking-wide transition-all",
              activeTab === t ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-400 hover:text-slate-600")}>
            {t === "info" ? "Datos" : t === "purchases" ? `Compras (${purchases.length})` : `Actividad (${interactions.length})`}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4 overflow-auto flex-1">
        {/* Info tab */}
        {activeTab === "info" && (
          <>
            <Field label="Nombre">
              <input className="input-field" value={form.name ?? ""} onChange={(e) => change("name", e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <input className="input-field" value={form.phone ?? ""} onChange={(e) => change("phone", e.target.value)} />
            </Field>
            {/* Stage is now controlled via the timeline above */}
            <Field label="Notas">
              <textarea className="input-field" rows={3} value={form.notes ?? ""} onChange={(e) => change("notes", e.target.value)} placeholder="Escribe una nota..." />
            </Field>
            {status === "saving" && <p className="text-xs text-slate-400">Guardando...</p>}
            {status === "saved" && <p className="text-xs text-green-500">✓ Guardado</p>}
            <button onClick={deleteLead} className="text-xs text-red-400 hover:text-red-600 mt-4">Eliminar lead</button>
          </>
        )}

        {/* Purchases tab */}
        {activeTab === "purchases" && (
          purchases.length === 0
            ? <div className="text-center py-8 text-slate-400 text-sm">Sin compras registradas</div>
            : purchases.map((p) => <PurchaseCard key={p.id} interaction={p} />)
        )}

        {/* Activity tab */}
        {activeTab === "activity" && (
          interactions.length === 0
            ? <div className="text-center py-8 text-slate-400 text-sm">Sin actividad</div>
            : <div className="space-y-2">
                {interactions.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((it) => <ActivityRow key={it.id} it={it} />)}
              </div>
        )}
      </div>
    </Drawer>
  );
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className={cn("text-lg font-bold", color || "text-slate-900")}>{value}</div>
      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function PurchaseCard({ interaction: p }: { interaction: Interaction }) {
  const meta = (p.meta ?? {}) as Record<string, unknown>;
  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <div className="font-semibold text-sm text-slate-900">{String(meta.product || "Producto")}</div>
            <div className="text-xs text-slate-400">{formatDate(p.created_at)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-green-600">${Number(meta.amount_usd || 0).toLocaleString()}</div>
          {meta.method ? <div className="text-[10px] text-slate-400">{String(meta.method)}</div> : null}
        </div>
      </div>
    </div>
  );
}

const SALE_STAGES = [
  { key: "new", label: "Nuevo", color: "bg-indigo-500", ring: "ring-indigo-200" },
  { key: "contacted", label: "Contactado", color: "bg-blue-500", ring: "ring-blue-200" },
  { key: "interested", label: "Interesado", color: "bg-amber-500", ring: "ring-amber-200" },
  { key: "sold", label: "Vendido", color: "bg-green-500", ring: "ring-green-200" },
] as const;

const POST_SALE_STAGES = [
  { key: "delivered", label: "Entregado", color: "bg-teal-500", ring: "ring-teal-200" },
  { key: "follow_up", label: "Seguimiento", color: "bg-cyan-500", ring: "ring-cyan-200" },
  { key: "recontact", label: "Recontacto", color: "bg-violet-500", ring: "ring-violet-200" },
  { key: "resold", label: "Re-vendido", color: "bg-emerald-500", ring: "ring-emerald-200" },
] as const;

const ALL_FLOW_STAGES = [...SALE_STAGES, ...POST_SALE_STAGES];

function StageTimeline({ currentStage, onChangeStage }: { currentStage: string; onChangeStage: (s: string) => void }) {
  const allIdx = ALL_FLOW_STAGES.findIndex((s) => s.key === currentStage);
  const isLost = currentStage === "lost";
  const isPostSale = POST_SALE_STAGES.some((s) => s.key === currentStage);

  function renderFlow(stages: readonly { key: string; label: string; color: string; ring: string }[], globalOffset: number) {
    return (
      <>
        <div className="flex items-center">
          {stages.map((s, i, arr) => {
            const globalIdx = globalOffset + i;
            const isCurrent = s.key === currentStage;
            const isPast = !isLost && allIdx >= 0 && globalIdx <= allIdx;
            const isActive = isCurrent || isPast;

            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <button onClick={() => onChangeStage(s.key)}
                  className={cn(
                    "relative w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-all shrink-0",
                    isCurrent ? `${s.color} text-white ring-3 ${s.ring} scale-110` :
                    isActive ? `${s.color} text-white` :
                    "bg-slate-200 text-slate-400 hover:bg-slate-300"
                  )}
                  title={s.label}>
                  {isActive && !isCurrent ? "✓" : (globalIdx + 1)}
                </button>
                {i < arr.length - 1 && (
                  <div className="h-0.5 flex-1 mx-0.5 rounded">
                    <div className={cn("h-full rounded", isPast && globalIdx < allIdx ? "bg-slate-400" : "bg-slate-200")} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center mt-1">
          {stages.map((s, i, arr) => (
            <div key={s.key} className={cn("text-[8px] font-medium text-center", i < arr.length - 1 ? "flex-1" : "", s.key === currentStage ? "text-slate-700 font-bold" : "text-slate-400")}>
              {s.label}
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Venta flow */}
      <div>
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Venta</div>
        {renderFlow(SALE_STAGES, 0)}
      </div>

      {/* Post-venta flow */}
      <div className={cn(!isPostSale && allIdx < SALE_STAGES.length && !isLost ? "opacity-40" : "")}>
        <div className="text-[9px] font-bold text-teal-500 uppercase tracking-wider mb-1.5">Post-venta</div>
        {renderFlow(POST_SALE_STAGES, SALE_STAGES.length)}
      </div>

      {/* Lost button */}
      <div>
        <button onClick={() => onChangeStage("lost")}
          className={cn(
            "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border",
            isLost ? "bg-red-500 text-white border-red-500" : "bg-white text-slate-400 border-slate-200 hover:border-red-300 hover:text-red-500"
          )}>
          ✕ Perdido
        </button>
      </div>
    </div>
  );
}

const KIND_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  lead_created: { icon: "🌱", color: "bg-green-50", label: "Lead creado" },
  message_out: { icon: "📤", color: "bg-indigo-50", label: "Mensaje enviado" },
  message_in: { icon: "📥", color: "bg-blue-50", label: "Mensaje recibido" },
  stage_change: { icon: "🔀", color: "bg-amber-50", label: "Cambio de etapa" },
  note: { icon: "📝", color: "bg-purple-50", label: "Nota" },
  purchase: { icon: "💰", color: "bg-green-50", label: "Compra" },
};

function ActivityRow({ it }: { it: Interaction }) {
  const cfg = KIND_ICONS[it.kind] || { icon: "•", color: "bg-slate-50", label: it.kind };
  const meta = (it.meta ?? {}) as Record<string, unknown>;

  return (
    <div className="flex gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0", cfg.color)}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">{cfg.label}</span>
          {it.kind === "purchase" && <span className="text-xs font-bold text-green-600">${Number(meta.amount_usd || 0).toLocaleString()}</span>}
          <span className="text-[10px] text-slate-400 ml-auto">{formatDate(it.created_at)}</span>
        </div>
        {it.body && <p className="text-xs text-slate-500 mt-0.5 truncate">{it.body}</p>}
      </div>
    </div>
  );
}
