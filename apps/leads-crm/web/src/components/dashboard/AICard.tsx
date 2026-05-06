import { Brain } from "lucide-react";
import { ConfigCard } from "../cards/ConfigCard";
import { RuleGroup } from "./RuleGroup";
import type { RuleSummary } from "../../hooks/useDashboardData";
import type { RuleBuckets } from "../../lib/dashboard-aggregations";
import { gotoView } from "../../hooks/useGoto";

const sumHits = (rs: RuleSummary[]) => rs.reduce((s, r) => s + r.hits_count, 0);

type Props = { rules: RuleSummary[]; buckets: RuleBuckets };

export function AICard({ rules, buckets }: Props) {
  const { productRules, learnedRules, manualRules } = buckets;

  return (
    <ConfigCard
      icon={Brain}
      iconColor="text-purple-600 bg-purple-50"
      title="Entrenamiento IA"
      subtitle={`${rules.length} reglas activas · ${learnedRules.length} aprendidas del historial`}
      ctaLabel="Configurar reglas"
      onCtaClick={() => gotoView("training")}
      empty={rules.length === 0 ? "Sin reglas configuradas" : null}
    >
      <div className="space-y-1">
        <RuleGroup label="Por producto" count={productRules.length} hits={sumHits(productRules)} color="blue" />
        <RuleGroup label="Aprendidas del p4" count={learnedRules.length} hits={sumHits(learnedRules)} color="purple" />
        <RuleGroup label="Manuales" count={manualRules.length} hits={sumHits(manualRules)} color="slate" />
      </div>

      {learnedRules.length > 0 && <TopIntents rules={learnedRules} />}
    </ConfigCard>
  );
}

function TopIntents({ rules }: { rules: RuleSummary[] }) {
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">Top intenciones detectadas</div>
      <div className="flex flex-wrap gap-1">
        {rules.slice(0, 6).map(r => (
          <span key={r.id} className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
            {r.tag.replace(/^intent:/, "")}
          </span>
        ))}
      </div>
    </div>
  );
}
