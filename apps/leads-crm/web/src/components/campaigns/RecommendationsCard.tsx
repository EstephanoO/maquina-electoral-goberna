import { useState } from "react";
import { Sparkles, TrendingUp, Crown, Lightbulb, Clock, Repeat, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRecommendations } from "../../hooks/useRecommendations";
import { Avatar, EmptyState } from "../ui";
import { formatMoney } from "../../lib/utils";
import type { Recommendation } from "../../types/recommendation";

const REASON_TABS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "all",          label: "Todos",            icon: Sparkles },
  { key: "vip_inactive", label: "VIPs inactivos",   icon: Crown },
  { key: "hot_interest", label: "Hot interest",     icon: Lightbulb },
  { key: "stuck",        label: "Estancados",       icon: Clock },
  { key: "crosssell",    label: "Cross-sell",       icon: Repeat },
];

type Props = { onSelect?: (lead: Recommendation) => void };

export function RecommendationsCard({ onSelect }: Props) {
  const [tab, setTab] = useState("all");
  const { data, isLoading } = useRecommendations(tab, 30);

  return (
    <section className="card p-5 space-y-3">
      <header className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-500" />
            ¿A quién hablar ahora?
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Recomendaciones basadas en señales: tier · interés · días sin contacto · stage estancado.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {REASON_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              tab === key
                ? "bg-[#1B365D] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-xs text-slate-400 py-6 text-center">Calculando…</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Sparkles} title="Sin recomendaciones" description="Todos los leads están atendidos ✨" size="sm" />
      ) : (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {data.map(r => <Row key={r.id} r={r} onSelect={() => onSelect?.(r)} />)}
        </div>
      )}
    </section>
  );
}

function Row({ r, onSelect }: { r: Recommendation; onSelect: () => void }) {
  const reasonColor = (rs: string): string => {
    if (rs.includes("VIP"))            return "bg-amber-100 text-amber-800";
    if (rs.includes("Hot"))            return "bg-rose-100 text-rose-700";
    if (rs.includes("Interesado"))     return "bg-blue-100 text-blue-700";
    if (rs.includes("Cross-sell"))     return "bg-emerald-100 text-emerald-700";
    if (rs.includes("Repeat"))         return "bg-violet-100 text-violet-700";
    if (rs.includes("ERP"))            return "bg-cyan-100 text-cyan-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition text-left"
    >
      <Avatar name={r.name || r.phone} size="sm" ring={r.buyer_tier === "vip" ? "vip" : null} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-800 truncate">{r.name || r.phone}</span>
          {r.country && <span className="text-[10px] text-slate-500">{r.country}</span>}
        </div>

        <div className="flex flex-wrap gap-1 mb-1">
          {r.reasons.map((reason, i) => (
            <span key={i} className={`badge ${reasonColor(reason)}`}>{reason}</span>
          ))}
        </div>

        <div className="text-[10px] text-slate-500 flex items-center gap-2">
          <span>último msg hace {r.days_since_in}d</span>
          {r.n_purchases > 0 && <span>· {r.n_purchases} compras</span>}
          {r.last_course && <span className="truncate text-purple-700">📚 {r.last_course.slice(0, 28)}</span>}
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="flex items-center gap-1 text-amber-600 font-bold text-sm tabular-nums">
          <TrendingUp className="w-3 h-3" /> {r.score}
        </div>
        {r.total_usd_spent > 0 && (
          <span className="text-[10px] text-emerald-700 font-mono font-semibold">
            {formatMoney(r.total_usd_spent)}
          </span>
        )}
      </div>
    </button>
  );
}
