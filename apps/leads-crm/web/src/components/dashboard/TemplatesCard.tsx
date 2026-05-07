import { FileText } from "lucide-react";
import { ConfigCard } from "../cards/ConfigCard";
import { TemplateRow } from "./TemplateRow";
import type { TemplateSummary } from "../../hooks/useDashboardData";
import { gotoView } from "../../hooks/useGoto";

type Props = { templates: TemplateSummary[] };

export function TemplatesCard({ templates }: Props) {
  const totalUses = templates.reduce((s, t) => s + (t.uses_count || 0), 0);
  const top = templates.slice().sort((a, b) => (b.uses_count || 0) - (a.uses_count || 0)).slice(0, 6);

  return (
    <ConfigCard
      icon={FileText}
      iconColor="text-emerald-600 bg-emerald-50"
      title="Templates"
      subtitle={`${templates.length} listos · ${totalUses.toLocaleString()} usos históricos`}
      ctaLabel="Ver templates"
      onCtaClick={() => gotoView("leads")}
      empty={templates.length === 0 ? "Sin templates" : null}
    >
      <div className="space-y-2">
        {top.map(t => <TemplateRow key={t.id} t={t} />)}
      </div>
    </ConfigCard>
  );
}
