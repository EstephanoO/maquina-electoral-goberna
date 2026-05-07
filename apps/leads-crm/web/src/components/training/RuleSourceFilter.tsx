import type { Rule } from "../../types/training";
import { RULE_SOURCE_LABELS } from "../../types/training";

export type SourceKey = "all" | "manual" | "product" | "learned_p4" | "system_seed";

type Props = {
  value: SourceKey;
  onChange: (v: SourceKey) => void;
  rules: Rule[];
};

const ORDER: SourceKey[] = ["all", "product", "learned_p4", "manual", "system_seed"];

export function RuleSourceFilter({ value, onChange, rules }: Props) {
  function count(k: SourceKey): number {
    if (k === "all") return rules.length;
    return rules.filter(r => (r.source ?? "manual") === k).length;
  }
  return (
    <div className="flex gap-1.5 flex-wrap mb-3">
      {ORDER.map(k => {
        const n = count(k);
        if (k !== "all" && n === 0) return null;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={`px-2.5 py-1 rounded-md text-[12px] transition ${
              value === k ? "bg-[#1a3a6b] text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {k === "all" ? "Todas" : RULE_SOURCE_LABELS[k] ?? k} <span className="opacity-60 ml-1">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
