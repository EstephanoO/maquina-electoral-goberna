import { Users, DollarSign, TrendingUp, Crown } from "lucide-react";
import { formatMoney, STAGE_CONFIG } from "../lib/utils";
import { useDashboardData } from "../hooks/useDashboardData";
import {
  aggregateByCountry, aggregateByStage, bucketRulesBySource, sumRevenue,
} from "../lib/dashboard-aggregations";
import {
  KPI, CoursesCard, AICard, TemplatesCard,
  RevenueByCountryChart, StageDistributionChart, CountryTable,
} from "../components";

export default function DashboardPage() {
  const { loading, leads, products, rules, templates } = useDashboardData();

  if (loading) return <div className="p-6 text-center text-slate-400">Cargando dashboard...</div>;

  const total = leads.length;
  const buyers = leads.filter(l => (l.n_purchases || 0) > 0).length;
  const vips = leads.filter(l => l.buyer_tier === "vip").length;
  const revenue = sumRevenue(leads);
  const vipRevenue = sumRevenue(leads, l => l.buyer_tier === "vip");

  const countryData = aggregateByCountry(leads);
  const stageData = aggregateByStage(leads, k => STAGE_CONFIG[k as keyof typeof STAGE_CONFIG]?.label || k);
  const buckets = bucketRulesBySource(rules);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Vista general de tu base de leads y configuración del bot</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={Users} label="Total leads" value={total.toLocaleString()} color="bg-indigo-50 text-indigo-600" />
        <KPI icon={DollarSign} label="Revenue total" value={formatMoney(revenue)} color="bg-green-50 text-green-600" />
        <KPI icon={TrendingUp} label="Compradores" value={buyers.toLocaleString()}
             sub={total > 0 ? `${((buyers / total) * 100).toFixed(1)}% conversión` : undefined}
             color="bg-blue-50 text-blue-600" />
        <KPI icon={Crown} label="VIPs" value={vips.toString()} sub={`${formatMoney(vipRevenue)} gastado`}
             color="bg-[#FAF6EB] text-[#B8942F]" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CoursesCard products={products} productRulesCount={buckets.productRules.length} />
        <AICard rules={rules} buckets={buckets} />
        <TemplatesCard templates={templates} />
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <RevenueByCountryChart data={countryData} />
        <StageDistributionChart data={stageData} />
      </section>

      <CountryTable data={countryData} />
    </div>
  );
}
