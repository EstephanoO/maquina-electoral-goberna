import { Bot, Inbox, Send, Users, AlertCircle, Calendar, Sparkles, RefreshCw, TrendingUp, UserPlus, ShoppingBag } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  useBotActivityDaily, useTemplateStats, useRuleStats,
  useHotLeadsList, useRecoverStale,
} from "../hooks/useBotActivity";
import { useTodayDeep } from "../hooks/useBotActivityExtras";
import {
  CountryDistribution, HourlyChart, IntentsToday,
  TopActiveLeads, RecentMessagesFeed,
} from "../components/bot";
import { Avatar, Button, EmptyState } from "../components/ui";
import { KPI } from "../components";
import { formatRelative } from "../lib/utils";

export default function BotActivityPage() {
  const today = useTodayDeep();
  const daily = useBotActivityDaily(14);
  const templates = useTemplateStats();
  const rules = useRuleStats();
  const hot = useHotLeadsList();
  const recover = useRecoverStale();

  const t = today.data;
  const coverage = t && t.msgs_in > 0 ? ((t.auto_replies / t.msgs_in) * 100).toFixed(1) : "0";

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
            <Bot className="w-6 h-6 text-purple-600" />
            Bot · reporte en vivo
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Todo lo que pasa en p4 (Kathy +51944531711) hoy y los últimos 14 días.
          </p>
        </div>
        <Button
          variant="secondary" size="sm"
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          loading={recover.isPending}
          onClick={() => recover.mutate()}
        >
          Recuperar leads stale
        </Button>
      </header>

      {/* TOTALES DEL DÍA · 8 KPIs */}
      <section>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">Totales del día</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI icon={Inbox}     label="Mensajes IN"        value={fmt(t?.msgs_in)}            color="bg-blue-50 text-blue-600"
               sub={t ? `${t.media_in} media adjunta` : undefined} />
          <KPI icon={Send}      label="Mensajes OUT"       value={fmt(t?.msgs_out)}           color="bg-emerald-50 text-emerald-600"
               sub={t ? `${t.media_out} media enviada` : undefined} />
          <KPI icon={Bot}       label="Auto-reply"         value={fmt(t?.auto_replies)}       color="bg-purple-50 text-purple-600"
               sub={`${coverage}% cobertura · ${t?.unique_leads_replied ?? 0} leads`} />
          <KPI icon={Users}     label="Leads únicos hoy"   value={fmt(t?.unique_leads_in)}    color="bg-amber-50 text-amber-600" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <KPI icon={UserPlus}   label="Leads nuevos"       value={fmt(t?.new_leads_today)}    color="bg-indigo-50 text-indigo-600" />
          <KPI icon={Calendar}   label="Citas agendadas"    value={fmt((t?.agenda_proposed ?? 0) + (t?.agenda_confirmed ?? 0))} color="bg-cyan-50 text-cyan-600"
               sub={`${fmt(t?.agenda_confirmed)} confirmadas`} />
          <KPI icon={ShoppingBag} label="Auto-ventas"       value={fmt(t?.auto_sold_today)}    color="bg-emerald-50 text-emerald-600"
               sub="payment_proof detectado" />
          <KPI icon={AlertCircle} label="Hot leads"         value={fmt(hot.data?.length)}      color="bg-red-50 text-red-600"
               sub="atención pendiente" />
        </div>
      </section>

      {/* CHART últimos 14 días */}
      <section className="card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">Últimos 14 días · evolución</h2>
        {daily.data && daily.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={[...daily.data].reverse()}>
              <XAxis dataKey="day" tickFormatter={(d) => new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="msgs_in"      name="Recibidos"  stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="msgs_manual"  name="Kathy manual" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="auto_replies" name="Auto-reply"  stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-xs text-slate-400 py-6 text-center">Cargando…</div>
        )}
      </section>

      {/* GEOGRAFÍA + HORARIO */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CountryDistribution />
        <HourlyChart />
      </section>

      {/* INTENTS + TOP ACTIVE LEADS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <IntentsToday />
        <TopActiveLeads />
      </section>

      {/* RECENT MESSAGES + HOT LEADS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RecentMessagesFeed />

        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Hot leads pendientes ({hot.data?.length ?? 0})
          </h2>
          {hot.data && hot.data.length > 0 ? (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {hot.data.map(l => (
                <a key={l.id} href={`/leads/${l.id}`}
                   className="flex items-center gap-2.5 p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                  <Avatar name={l.name || l.phone} size="sm" ring={l.buyer_tier === "vip" ? "vip" : null} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{l.name || l.phone}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      {l.country && <span>{l.country}</span>}
                      <span>·</span>
                      <span className="badge bg-amber-100 text-amber-800">{l.attention_reason}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 shrink-0">{formatRelative(l.attention_at)}</div>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState icon={Sparkles} title="Sin hot leads" description="Bot al día ✨" size="sm" />
          )}
        </div>
      </section>

      {/* TEMPLATES + RULES */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            Templates más usados (7 días)
          </h2>
          {templates.data && templates.data.length > 0 ? (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {templates.data.slice(0, 12).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="badge bg-slate-100 text-slate-600">{t.category}</span>
                  <span className="flex-1 truncate text-slate-700">{t.name.replace(/_/g, " ")}</span>
                  <span className="font-mono tabular-nums text-blue-700 font-bold">{t.sent_7d}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-slate-400 py-3">Sin data</div>}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Reglas IA · matches históricos
          </h2>
          {rules.data && rules.data.length > 0 ? (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {rules.data.filter(r => r.hits_count > 0).slice(0, 12).map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className={`badge ${
                    r.source === "product"     ? "bg-blue-100 text-blue-700" :
                    r.source === "learned_p4"  ? "bg-purple-100 text-purple-700" :
                    r.source === "bot_legacy"  ? "bg-amber-100 text-amber-700" :
                                                  "bg-slate-100 text-slate-700"
                  }`}>{r.source}</span>
                  <span className="flex-1 truncate text-slate-700">{r.name}</span>
                  <span className="font-mono tabular-nums text-emerald-700 font-bold">{r.hits_count}</span>
                </div>
              ))}
              <div className="text-[10px] text-slate-400 pt-2 italic text-center">
                {rules.data.filter(r => r.hits_count === 0).length} reglas sin matches (candidatas a depurar)
              </div>
            </div>
          ) : <div className="text-xs text-slate-400 py-3">Sin data</div>}
        </div>
      </section>
    </div>
  );
}

function fmt(n: any): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString();
}
