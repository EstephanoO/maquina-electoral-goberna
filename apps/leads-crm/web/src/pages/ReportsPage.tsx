import { useEffect, useState } from "react";
import { api } from "../api";
import { cn } from "../lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  MessageSquare, UserPlus, Send, Users, ChevronLeft, ChevronRight,
  Clock, Globe, Package, Zap, Calendar, CalendarDays, CalendarRange,
} from "lucide-react";

type Period = "day" | "month" | "year";

type DailyReport = {
  date: string;
  period: Period;
  summary: {
    new_leads: number;
    messages_in: number;
    messages_out: number;
    unique_leads_contacted: number;
    first_time_contacts: number;
  };
  timeline: { label: string; count: number }[];
  timeline_label: string;
  by_source: { source: string; count: number }[];
  by_country: { country: string; count: number }[];
  product_interest: { product: string; count: number; leads: { name: string; phone: string; body: string; time: string }[] }[];
  new_leads: { id: number; name: string; phone: string; country: string; source: string; stage: string; created_at: string }[];
  first_contacts: { id: number; name: string; phone: string; country: string; body: string; first_msg_at: string }[];
  recent_messages: { id: number; lead_name: string; lead_phone: string; lead_country: string; lead_stage: string; body: string; time: string }[];
};

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function ReportsPage() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState<Period>("day");
  const [activeTab, setActiveTab] = useState<"overview" | "messages" | "products" | "leads">("overview");

  useEffect(() => {
    setLoading(true);
    api.dailyReport({ date, period }).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [date, period]);

  function changeDate(delta: number) {
    const d = new Date(date);
    if (period === "year") d.setFullYear(d.getFullYear() + delta);
    else if (period === "month") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  }

  const isToday = date === new Date().toISOString().slice(0, 10);
  const isCurrentMonth = date.slice(0, 7) === new Date().toISOString().slice(0, 7);
  const isCurrentYear = date.slice(0, 4) === new Date().getFullYear().toString();
  const isAtPresent = period === "day" ? isToday : period === "month" ? isCurrentMonth : isCurrentYear;

  function getPeriodDisplay(): string {
    const d = new Date(date);
    if (period === "year") return d.getFullYear().toString();
    if (period === "month") return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  const periodModes: { key: Period; icon: typeof Calendar; label: string }[] = [
    { key: "day", icon: Calendar, label: "Diario" },
    { key: "month", icon: CalendarDays, label: "Mensual" },
    { key: "year", icon: CalendarRange, label: "Anual" },
  ];

  if (loading) return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl border animate-pulse" />)}
        </div>
        <div className="h-72 bg-white rounded-2xl border animate-pulse" />
      </div>
    </div>
  );

  if (!report) return <div className="p-6 text-center text-slate-400">No hay datos para esta fecha</div>;

  const s = report.summary;
  const peakItem = report.timeline.reduce((max, h) => h.count > max.count ? h : max, { label: "", count: 0 });

  const tabs = [
    { key: "overview" as const, label: "Resumen" },
    { key: "messages" as const, label: `Mensajes (${s.messages_in.toLocaleString()})` },
    { key: "products" as const, label: `Productos (${report.product_interest.length})` },
    { key: "leads" as const, label: `Leads nuevos (${s.new_leads.toLocaleString()})` },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
          <p className="text-sm text-slate-500 capitalize">{getPeriodDisplay()}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1">
            {periodModes.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  period === p.key ? "bg-[#C8A951] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
                )}>
                <p.icon className="w-3.5 h-3.5" />
                {p.label}
              </button>
            ))}
          </div>

          {/* Date nav */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => changeDate(-1)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {period === "day" && (
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium bg-white" />
            )}
            {period === "month" && (
              <input type="month" value={date.slice(0, 7)} onChange={(e) => setDate(e.target.value + "-01")}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium bg-white" />
            )}
            {period === "year" && (
              <select value={date.slice(0, 4)} onChange={(e) => setDate(`${e.target.value}-01-01`)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium bg-white">
                {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
            <button onClick={() => changeDate(1)} disabled={isAtPresent}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isAtPresent && (
              <button onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                className="px-3 py-2 rounded-xl bg-[#C8A951] text-white text-xs font-bold hover:bg-[#B8942F]">
                Hoy
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI icon={MessageSquare} label="Mensajes recibidos" value={s.messages_in} color="bg-blue-50 text-blue-600" />
        <KPI icon={Send} label="Mensajes enviados" value={s.messages_out} color="bg-indigo-50 text-indigo-600" />
        <KPI icon={UserPlus} label="Leads nuevos" value={s.new_leads} color="bg-green-50 text-green-600" />
        <KPI icon={Users} label="Leads activos" value={s.unique_leads_contacted} color="bg-[#FAF6EB] text-[#B8942F]" />
        <KPI icon={Zap} label="Primer contacto" value={s.first_time_contacts} color="bg-violet-50 text-violet-600" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn("flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
              activeTab === t.key ? "bg-[#C8A951] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Timeline chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <h3 className="font-semibold text-sm text-slate-700">{report.timeline_label}</h3>
              </div>
              {peakItem.count > 0 && (
                <span className="text-xs text-slate-500">
                  Pico: <strong>{peakItem.label}</strong> ({peakItem.count.toLocaleString()} msgs)
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={report.timeline}>
                <XAxis dataKey="label" fontSize={10} tickLine={false} interval={period === "month" ? 2 : period === "day" ? 2 : 0} />
                <YAxis fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} mensajes`, "Recibidos"]} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* By country */}
            {report.by_country.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-slate-400" />
                  <h3 className="font-semibold text-sm text-slate-700">Leads nuevos por país</h3>
                </div>
                <div className="space-y-2">
                  {report.by_country.slice(0, 10).map((c) => (
                    <div key={c.country} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{c.country}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-[#C8A951]" style={{ width: Math.max(20, (c.count / (report.by_country[0]?.count || 1)) * 120) }} />
                        <span className="text-xs font-bold text-slate-600 w-12 text-right">{c.count.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By source */}
            {report.by_source.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-slate-400" />
                  <h3 className="font-semibold text-sm text-slate-700">Fuente de leads</h3>
                </div>
                <div className="space-y-2">
                  {report.by_source.map((s) => (
                    <div key={s.source} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{s.source}</span>
                      <span className="text-xs font-bold text-[#B8942F] bg-[#FAF6EB] px-2 py-0.5 rounded">{s.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Product interest */}
          {report.product_interest.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-slate-400" />
                <h3 className="font-semibold text-sm text-slate-700">Interés por producto detectado</h3>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {report.product_interest.map((p) => (
                  <div key={p.product} className="p-3 rounded-xl bg-violet-50 border border-violet-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-violet-800">{p.product}</span>
                      <span className="text-lg font-bold text-violet-600">{p.count}</span>
                    </div>
                    <div className="text-[10px] text-violet-600">
                      {p.leads.slice(0, 3).map((l, i) => (
                        <div key={i} className="truncate">{l.name} - {formatTime(l.time)}</div>
                      ))}
                      {p.leads.length > 3 && <div className="font-semibold mt-1">+{p.leads.length - 3} más</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "messages" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">Últimos mensajes recibidos ({report.recent_messages.length})</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {report.recent_messages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">Sin mensajes entrantes</div>
            ) : report.recent_messages.map((m) => (
              <div key={m.id} className="px-5 py-3 hover:bg-[#FAF6EB]/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{m.lead_name || m.lead_phone}</span>
                    {m.lead_country && <span className="text-[10px] text-slate-400">{m.lead_country}</span>}
                  </div>
                  <span className="text-[10px] text-slate-400">{formatDateTime(m.time)}</span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "products" && (
        <div className="space-y-4">
          {report.product_interest.length === 0 ? (
            <div className="bg-white rounded-2xl border p-8 text-center text-slate-400 text-sm">
              No se detectó interés por productos específicos en este periodo
            </div>
          ) : report.product_interest.map((p) => (
            <div key={p.product} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-violet-50 border-b border-violet-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-violet-600" />
                  <h3 className="text-sm font-bold text-violet-800">{p.product}</h3>
                </div>
                <span className="text-sm font-bold text-violet-600">{p.count} interesado{p.count !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                {p.leads.map((l, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{l.name}</div>
                      <div className="text-xs text-slate-400">{l.phone}</div>
                    </div>
                    <div className="text-right max-w-xs">
                      <p className="text-xs text-slate-500 truncate">{l.body}</p>
                      <div className="text-[10px] text-slate-400">{formatDateTime(l.time)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "leads" && (
        <div className="space-y-4">
          {/* First contacts */}
          {report.first_contacts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-green-50 border-b border-green-200">
                <h3 className="text-sm font-bold text-green-800">Primer contacto ({report.first_contacts.length})</h3>
                <p className="text-[10px] text-green-600">Leads que escribieron por primera vez</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                {report.first_contacts.map((l) => (
                  <div key={l.id} className="px-5 py-3 hover:bg-green-50/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{l.name || l.phone}</span>
                        {l.country && <span className="text-xs text-slate-400 ml-2">{l.country}</span>}
                      </div>
                      <span className="text-[10px] text-slate-400">{formatDateTime(l.first_msg_at)}</span>
                    </div>
                    {l.body && <p className="text-xs text-slate-500 mt-1 truncate">{l.body}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All new leads */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-700">Leads nuevos ({s.new_leads.toLocaleString()})</h3>
            </div>
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-[10px] text-slate-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-2">Nombre</th>
                    <th className="text-left px-4 py-2">Teléfono</th>
                    <th className="text-left px-4 py-2">País</th>
                    <th className="text-left px-4 py-2">Fuente</th>
                    <th className="text-left px-4 py-2">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {report.new_leads.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400 text-xs">Sin leads nuevos</td></tr>
                  ) : report.new_leads.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-[#FAF6EB]/30">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{l.name || "Sin nombre"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{l.phone}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{l.country || "—"}</td>
                      <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">{l.source}</span></td>
                      <td className="px-4 py-2.5 text-[10px] text-slate-400">{formatDateTime(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</div>
      <div className="text-[10px] text-slate-400 font-medium mt-0.5">{label}</div>
    </div>
  );
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) + " " +
           d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
