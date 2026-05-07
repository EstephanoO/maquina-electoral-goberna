import { Globe } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { CountryRow } from "../../lib/dashboard-aggregations";

export function RevenueByCountryChart({ data }: { data: CountryRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <header className="flex items-center gap-2 mb-4">
        <Globe className="w-4 h-4 text-slate-400" />
        <h3 className="font-semibold text-sm text-slate-700">Revenue por país</h3>
      </header>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} fontSize={11} />
          <YAxis type="category" dataKey="name" width={80} fontSize={11} />
          <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
          <Bar dataKey="revenue" fill="#6366f1" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
