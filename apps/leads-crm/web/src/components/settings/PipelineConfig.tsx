import { useEffect, useState } from "react";
import { Save, Plus, GitBranch, Loader2 } from "lucide-react";
import { usePipelineStages } from "../../hooks/useConfig";
import { useToast } from "../../toast";
import { StageRow } from "./StageRow";
import type { PipelineStage } from "../../types/config";

const NEW_STAGE: PipelineStage = {
  id: 0, key: "", label: "", color: "bg-slate-100 text-slate-800",
  position: 999, enabled: true, group_name: "sale",
};

export function PipelineConfig() {
  const toast = useToast();
  const { stages, loading, saveAll } = usePipelineStages();
  const [draft, setDraft] = useState<PipelineStage[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(stages); }, [stages]);

  if (loading) return <div className="p-6 text-center text-slate-400">Cargando…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(stages);

  function patch(idx: number, p: Partial<PipelineStage>) {
    setDraft(d => d.map((s, i) => i === idx ? { ...s, ...p } : s));
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= draft.length) return;
    setDraft(d => {
      const next = [...d];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((s, i) => ({ ...s, position: i + 1 }));
    });
  }
  function add() {
    const key = prompt("Key (en inglés, sin espacios — ej: 'pre_contacto'):");
    if (!key) return;
    setDraft(d => [...d, { ...NEW_STAGE, key, label: key, position: d.length + 1 }]);
  }
  function remove(idx: number) {
    if (!confirm(`Quitar "${draft[idx].label}"?`)) return;
    setDraft(d => d.filter((_, i) => i !== idx));
  }
  async function save() {
    setSaving(true);
    try { await saveAll(draft); toast("Embudo guardado", "ok"); }
    catch (e: any) { toast(`Error: ${e.message}`, "err"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-600" />
            Embudo de ventas
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Etapas del pipeline. Renombrá, reordená con las flechas, agregá las que necesites.
            Los cambios afectan el Kanban de leads.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={add} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded">
            <Plus size={14} /> Agregar etapa
          </button>
          <button
            onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={14} />}
            Guardar embudo
          </button>
        </div>
      </header>

      <div className="space-y-2">
        {draft.map((s, i) => (
          <StageRow
            key={s.key || i}
            stage={s}
            onChange={(p) => patch(i, p)}
            onMoveUp={() => move(i, i - 1)}
            onMoveDown={() => move(i, i + 1)}
            onRemove={() => remove(i)}
            isFirst={i === 0}
            isLast={i === draft.length - 1}
          />
        ))}
      </div>

      {dirty && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Tenés cambios sin guardar.
        </div>
      )}
    </div>
  );
}
