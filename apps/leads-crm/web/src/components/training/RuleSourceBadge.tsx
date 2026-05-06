import { RULE_SOURCE_COLORS, RULE_SOURCE_LABELS } from "../../types/training";

export function RuleSourceBadge({ source }: { source: string | null }) {
  const key = source ?? "manual";
  const label = RULE_SOURCE_LABELS[key] ?? key;
  const color = RULE_SOURCE_COLORS[key] ?? RULE_SOURCE_COLORS.manual;
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>{label}</span>;
}
