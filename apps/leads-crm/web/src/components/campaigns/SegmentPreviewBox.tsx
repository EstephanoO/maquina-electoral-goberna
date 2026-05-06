import { Users, Loader2 } from "lucide-react";
import { usePreviewSegment } from "../../hooks/useCampaigns";
import { formatMoney } from "../../lib/utils";
import { Avatar } from "../ui";

type Props = { filter: any | null };

export function SegmentPreviewBox({ filter }: Props) {
  const { data, isLoading } = usePreviewSegment(filter);

  if (!filter) {
    return <div className="text-xs text-slate-400 italic text-center py-6">Elegí un segmento para ver el preview</div>;
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Calculando segmento…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Users className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-2xl tabular-nums">{data.total.toLocaleString()}</span>
          <span className="text-xs text-slate-500">leads coinciden</span>
        </div>
      </div>

      {data.sample.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">
            Muestra (top {data.sample.length})
          </div>
          {data.sample.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-slate-50">
              <Avatar name={s.name || s.phone} size="xs" />
              <span className="font-medium text-slate-700 truncate flex-1">{s.name || s.phone}</span>
              {s.country && <span className="text-slate-400">{s.country}</span>}
              {Number(s.total_usd_spent) > 0 && (
                <span className="text-emerald-700 font-mono font-semibold">
                  {formatMoney(Number(s.total_usd_spent))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
