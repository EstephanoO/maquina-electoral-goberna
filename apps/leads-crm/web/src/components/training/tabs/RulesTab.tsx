import { useMemo, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useRules } from "../../../hooks/useRules";
import { RuleSourceFilter, type SourceKey } from "../RuleSourceFilter";
import { RuleTemplatePicker } from "../RuleTemplatePicker";
import { RulesTable } from "../RulesTable";
import { RuleEditorModal } from "../RuleEditorModal";
import type { Rule, RuleDraft } from "../../../types/training";

export function RulesTab() {
  const { rules, loading, toggle, remove, create, update } = useRules();
  const [sourceFilter, setSourceFilter] = useState<SourceKey>("all");
  const [editor, setEditor] = useState<Rule | null | undefined>(undefined);

  const filtered = useMemo(() => {
    if (sourceFilter === "all") return rules;
    return rules.filter(r => (r.source ?? "manual") === sourceFilter);
  }, [rules, sourceFilter]);

  async function onDelete(r: Rule) {
    if (!confirm(`Eliminar regla "${r.name}"?`)) return;
    await remove(r.id);
  }

  async function onSave(draft: RuleDraft, id?: number) {
    if (id != null) await update(id, draft);
    else await create(draft);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Reglas de clasificación</h2>
          <p className="text-xs text-slate-500 mt-1">
            Cuando un mensaje matchea el regex, el bot agrega la tag al lead. Cambios surten efecto en ~1 min (cache 60s).
          </p>
        </div>
        <button
          onClick={() => setEditor(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a3a6b] text-white rounded-md text-[13px] font-medium hover:bg-[#243d6b]"
        >
          <Plus className="w-4 h-4" /> Nueva regla
        </button>
      </header>

      <RuleTemplatePicker onPick={(t) => setEditor({ ...t, weight: 1.0, enabled: true } as any)} />
      <RuleSourceFilter value={sourceFilter} onChange={setSourceFilter} rules={rules} />

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />Cargando…
        </div>
      ) : (
        <RulesTable rules={filtered} onToggle={toggle} onEdit={setEditor} onDelete={onDelete} />
      )}

      <RuleEditorModal rule={editor} onClose={() => setEditor(undefined)} onSave={onSave} />
    </div>
  );
}
