import { Sparkles } from "lucide-react";
import { RULE_TEMPLATES, type RuleTemplate } from "../../types/training";

type Props = { onPick: (t: RuleTemplate) => void };

export function RuleTemplatePicker({ onPick }: Props) {
  return (
    <details className="bg-white rounded-lg border border-slate-200 p-3 mb-4">
      <summary className="cursor-pointer flex items-center gap-2 text-[13px] font-medium text-slate-700">
        <Sparkles className="w-4 h-4 text-amber-500" />
        Crear desde plantilla ({RULE_TEMPLATES.length} sugeridas)
      </summary>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
        {RULE_TEMPLATES.map(t => (
          <button
            key={t.name}
            onClick={() => onPick(t)}
            className="text-left p-2.5 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition"
          >
            <div className="text-[13px] font-medium text-slate-800">{t.name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{t.description}</div>
            <div className="text-[10px] font-mono text-slate-400 mt-1 truncate">{t.tag}</div>
          </button>
        ))}
      </div>
    </details>
  );
}
