import { Bot, Inbox, Send, Users, AlertCircle, Calendar, Clock, Sparkles, RefreshCw, TrendingUp } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  useBotActivityToday, useBotActivityDaily, useTemplateStats,
  useRuleStats, useHotLeadsList, useRecoverStale,
} from "../hooks/useBotActivity";
import { Avatar, Button, EmptyState } from "../components/ui";
import { KPI } from "../components";
import { formatRelative } from "../lib/utils";

export default function BotActivityPage() {
  const today = useBotActivityToday();
  const daily = useBotActivityDaily(14);
  const templates = useTemplateStats();
  const rules = useRuleStats();
  const hot = useHotLeadsList();
  const recover = useRecoverStale();

  const t = today.data;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
            <Bot className="w-6 h-6 text-purple-600" />
            Bot · actividad en vivo
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Qué hizo Kathy IA hoy y los últimos 14 días.
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

      {/* HOY */}
      <section>
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">Hoy</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI icon={Inbox}      label="Mensajes recibidos"  value={fmt(t?.msgs_in)} color="bg-blue-50 text-blue-600" />
          <KPI icon={Bot}        label="Respuestas auto"     value={fmt(t?.auto_replies)} color="bg-purple-50 text-purple-600"
               sub={t?.msgs_in ? `${pct(Number(t.auto_replies), Number(t.msgs_in))}% cobertura` : undefined} />
          <KPI icon={Send}       label="Mensajes Kathy"      value={fmt(t?.msgs_manual)} color="bg-emerald-50 text-emerald-600" />
          <KPI icon={Users}      label="Leads únicos"        value={fmt(t?.unique_leads_in)} color="bg-amber-50 text-amber-600" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <KPI icon={Sparkles}    label="Holdings"            value={fmt(t?.holdings_sent)} color="bg-rose-50 text-rose-600" />
          <KPI icon={Calendar}    label="Citas propuestas"    value={fmt(t?.agenda_proposed)} color="bg-cyan-50 text-cyan-600" />
          <KPI icon={Calendar}    label="Citas confirmadas"   value={fmt(t?.agenda_confirmed)} color="bg-emerald-50 text-emerald-600" />
          <KPI icon={AlertCircle} label="Atención hoy"        value={fmt(t?.attention_today)} color="bg-red-50 text-red-600" />
        </div>
      </section>

      {/* CHART últimos 14 días */}
      <section className="card p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
          Últimos 14 días
        </h2>
        {daily.data && daily.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={[...daily.data].reverse()}>
              <XAxis dataKey="day" tickFormatter={(d) => new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="msgs_in"      name="IN"     stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="msgs_manual"  name="Kathy manual" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="auto_replies" name="Auto-reply" stroke="#a855f7" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-xs text-slate-400 py-6 text-center">Cargando…</div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* TEMPLATES */}
        <section className="card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            Templates más usados
          </h2>
          {templates.data && templates.data.length > 0 ? (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {templates.data.slice(0, 12).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{t.category}</span>
                  <span className="flex-1 truncate text-slate-700">{t.name.replace(/_/g, " ")}</span>
                  <span className="font-mono tabular-nums text-blue-700 font-semibold">{t.sent_7d}</span>
                  <span className="text-[10px] text-slate-400">7d</span>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-slate-400 py-3">Sin data</div>}
        </section>

        {/* RULES */}
        <section className="card p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Reglas IA · matches históricos
          </h2>
          {rules.data && rules.data.length > 0 ? (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {rules.data.filter(r => r.hits_count > 0).slice(0, 15).map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-100 last:border-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    r.source === "product"     ? "bg-blue-100 text-blue-700" :
                    r.source === "learned_p4"  ? "bg-purple-100 text-purple-700" :
                    r.source === "bot_legacy"  ? "bg-amber-100 text-amber-700" :
                                                  "bg-slate-100 text-slate-700"
                  }`}>
                    {r.source}
                  </span>
                  <span className="flex-1 truncate text-slate-700">{r.name}</span>
                  <span className="font-mono tabular-nums text-emerald-700 font-bold">{r.hits_count}</span>
                </div>
              ))}
              <div className="text-[10px] text-slate-400 pt-2 italic text-center">
                {rules.data.filter(r => r.hits_count === 0).length} reglas sin matches (candidatas a depurar)
              </div>
            </div>
          ) : <div className="text-xs text-slate-400 py-3">Sin data</div>}
        </section>
      </div>

      {/* HOT LEADS */}
      <section className="card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          Hot leads pendientes ({hot.data?.length ?? 0})
        </h2>
        {hot.data && hot.data.length > 0 ? (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {hot.data.map(l => (
              <a key={l.id} href={`/leads/${l.id}`} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition">
                <Avatar name={l.name || l.phone} size="sm" ring={l.buyer_tier === "vip" ? "vip" : null} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                    {l.name || l.phone}
                    <span className="badge bg-amber-100 text-amber-800">{l.attention_reason}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{l.country} · {l.stage}</div>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> {formatRelative(l.attention_at)}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState icon={AlertCircle} title="Sin hot leads" description="Bot al día ✨" size="sm" />
        )}
      </section>
    </div>
  );
}

function fmt(n: any): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}
function pct(a: number, b: number): string {
  if (!b) return "0";
  return ((a / b) * 100).toFixed(1);
}
