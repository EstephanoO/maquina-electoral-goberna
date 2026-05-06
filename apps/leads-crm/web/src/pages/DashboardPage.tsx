import { useEffect, useState } from "react";
import { api } from "../api";
import type { Lead } from "../types";
import { formatMoney, STAGE_CONFIG } from "../lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Users, DollarSign, Crown, Globe } from "lucide-react";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listLeads({ limit: 10000 } as any).then(setLeads).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-center text-slate-400">Cargando dashboard...</div>;

  const total = leads.length;
  const revenue = leads.reduce((s, l) => s + (l.total_usd_spent || 0), 0);
  const buyers = leads.filter((l) => (l.n_purchases || 0) > 0).length;
  const vips = leads.filter((l) => l.buyer_tier === "vip").length;

  // By country
  const byCountry = new Map<string, { leads: number; revenue: number }>();
  for (const l of leads) {
    const c = l.country || "Otro";
    const cur = byCountry.get(c) || { leads: 0, revenue: 0 };
    cur.leads++; cur.revenue += l.total_usd_spent || 0;
    byCountry.set(c, cur);
  }
  const countryData = [...byCountry.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8)
    .map(([name, v]) => ({ name, leads: v.leads, revenue: Math.round(v.revenue) }));

  // By stage
  const byStage = new Map<string, number>();
  for (const l of leads) byStage.set(l.stage, (byStage.get(l.stage) || 0) + 1);
  const stageData = [...byStage.entries()].map(([key, value]) => ({
    name: STAGE_CONFIG[key as keyof typeof STAGE_CONFIG]?.label || key, value,
  }));

  // By tier
  const byTier = new Map<string, number>();
  for (const l of leads) {
    const t = l.buyer_tier || "prospect";
    byTier.set(t, (byTier.get(t) || 0) + 1);
  }
  const tierData = [...byTier.entries()].map(([name, value]) => ({ name, value }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Vista general de tu base de leads</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={Users} label="Total leads" value={total.toLocaleString()} color="bg-indigo-50 text-indigo-600" />
        <KPI icon={DollarSign} label="Revenue total" value={formatMoney(revenue)} color="bg-green-50 text-green-600" />
        <KPI icon={TrendingUp} label="Compradores" value={buyers.toLocaleString()} sub={`${((buyers / total) * 100).toFixed(1)}% conversión`} color="bg-blue-50 text-blue-600" />
        <KPI icon={Crown} label="VIPs" value={vips.toString()} sub={`${formatMoney(leads.filter((l) => l.buyer_tier === "vip").reduce((s, l) => s + (l.total_usd_spent || 0), 0))} gastado`} color="bg-[#FAF6EB] text-[#B8942F]" />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Revenue by country */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-sm text-slate-700">Revenue por país</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={countryData} layout="vertical">
              <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} fontSize={11} />
              <YAxis type="category" dataKey="name" width={80} fontSize={11} />
              <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="revenue" fill="#6366f1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-sm text-slate-700 mb-4">Distribución por etapa</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={stageData} cx="50%" cy="50%" outerRadius={100} innerRadius={60} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} fontSize={11}>
                {stageData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Country table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-sm text-slate-700 mb-4">Detalle por país</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b">
                <th className="pb-2">País</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">Avg ticket</th>
              </tr>
            </thead>
            <tbody>
              {countryData.map((c) => (
                <tr key={c.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 font-medium">{c.name}</td>
                  <td className="py-2.5 text-right text-slate-500">{c.leads.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-semibold text-green-600">${c.revenue.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-slate-500">${c.leads > 0 ? Math.round(c.revenue / c.leads) : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
