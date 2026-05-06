import { DollarSign, ShoppingBag, Calendar, Award } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Lead } from "../../types";
import { formatMoney } from "../../lib/utils";

type LeadExt = Lead & {
  enrollments_count?: number;
  certificates_count?: number;
  last_purchase_year?: number | null;
};

export function LeadStatsGrid({ lead }: { lead: LeadExt }) {
  const items: Array<{ icon: LucideIcon; label: string; value: string }> = [
    { icon: DollarSign, label: "Total gastado", value: formatMoney(lead.total_usd_spent || 0) },
    { icon: ShoppingBag, label: "# Compras", value: String(lead.n_purchases ?? 0) },
    { icon: Award, label: "Certificados", value: String(lead.certificates_count ?? 0) },
    { icon: Calendar, label: "Última compra", value: lead.last_purchase_year ? String(lead.last_purchase_year) : "—" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((it, i) => <Stat key={i} {...it} />)}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wide">
        <Icon size={11} /> {label}
      </div>
      <div className="text-lg font-semibold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}
