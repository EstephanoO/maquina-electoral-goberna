import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { StageRow } from "../../lib/dashboard-aggregations";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

export function StageDistributionChart({ data }: { data: StageRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-semibold text-sm text-slate-700 mb-4">Distribución por etapa</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            outerRadius={100} innerRadius={60}
            dataKey="value"
            label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            fontSize={11}
          >
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
