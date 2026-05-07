import { Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useByHour } from "../../hooks/useBotActivityExtras";

export function HourlyChart() {
  const { data } = useByHour();

  // Fill 0-23 with zeros for empty hours
  const filled = Array.from({ length: 24 }, (_, h) => {
    const found = (data ?? []).find(d => d.hour === h);
    return { hour: `${String(h).padStart(2, "0")}h`, in_count: found?.in_count ?? 0, out_count: found?.out_count ?? 0 };
  });

  return (
    <div className="card p-5">
      <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-purple-500" />
        Actividad por hora · hoy (Lima TZ)
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={filled}>
          <XAxis dataKey="hour" fontSize={10} interval={1} />
          <YAxis fontSize={10} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="in_count"  name="Recibidos" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="out_count" name="Enviados"  fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
