import type { CountryRow } from "../../lib/dashboard-aggregations";

export function CountryTable({ data }: { data: CountryRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-semibold text-sm text-slate-700 mb-4">Detalle por país</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b">
              <th className="pb-2">País</th>
              <th className="pb-2 text-right">Leads</th>
              <th className="pb-2 text-right">Revenue</th>
              <th className="pb-2 text-right">Avg ticket</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
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
  );
}
