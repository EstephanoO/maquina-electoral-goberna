import { X, AlertCircle, Crown } from "lucide-react";
import type { Lead } from "../../types";
import { TIER_CONFIG, STAGE_CONFIG } from "../../lib/utils";

type Props = {
  lead: Lead & { needs_human_attention?: boolean; attention_reason?: string };
  onClose: () => void;
};

export function LeadDetailHeader({ lead, onClose }: Props) {
  const tierCfg = lead.buyer_tier ? TIER_CONFIG[lead.buyer_tier as keyof typeof TIER_CONFIG] : null;
  const stageCfg = STAGE_CONFIG[lead.stage as keyof typeof STAGE_CONFIG];
  const isVip = lead.buyer_tier === "vip";
  const placeholder = !lead.name || /^\+?\d+$/.test(lead.name);

  return (
    <header className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between z-10">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isVip && <Crown className="w-5 h-5 text-amber-500" fill="currentColor" />}
          <h2 className={`text-lg font-bold ${placeholder ? "text-slate-400 italic" : "text-slate-900"}`}>
            {placeholder ? "Sin nombre" : lead.name}
          </h2>
          {stageCfg && <span className={`px-2 py-0.5 rounded text-xs font-medium ${stageCfg.color}`}>{stageCfg.label}</span>}
          {tierCfg && <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">{tierCfg.label}</span>}
        </div>
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
          {lead.phone && <span>📱 {lead.phone}</span>}
          {lead.country && <span>📍 {lead.country}</span>}
          {lead.email && <span>✉ {lead.email}</span>}
        </div>
        {lead.needs_human_attention && (
          <div className="mt-2 flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="font-medium">Atención humana pendiente</span>
            {lead.attention_reason && <span className="text-amber-700/80 truncate">— {lead.attention_reason}</span>}
          </div>
        )}
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-4">
        <X size={20} />
      </button>
    </header>
  );
}
