import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { Modal } from "../Modal";
import { Field, TextInput, TextArea } from "../forms/Field";
import type { Rule, RuleDraft } from "../../types/training";
import { validateRegex } from "../../hooks/useProducts";

type Props = {
  rule: Rule | null | undefined;   // null = creating · object = editing · undefined = closed
  onClose: () => void;
  onSave: (draft: RuleDraft, id?: number) => Promise<unknown>;
};

const EMPTY: RuleDraft = { name: "", description: "", pattern: "", tag: "", weight: 1.0, enabled: true };

export function RuleEditorModal({ rule, onClose, onSave }: Props) {
  const [d, setD] = useState<RuleDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rule === undefined) return;
    setD(rule ? { ...rule } : EMPTY);
    setError(null);
  }, [rule]);

  if (rule === undefined) return null;

  const isNew = rule === null;
  const set = (patch: Partial<RuleDraft>) => setD(prev => ({ ...prev, ...patch }));

  async function save() {
    if (!d.name || !d.pattern || !d.tag) { setError("Nombre, pattern y tag son obligatorios"); return; }
    const regexErr = validateRegex(d.pattern);
    if (regexErr) { setError(`Regex inválido: ${regexErr}`); return; }
    setSaving(true); setError(null);
    try {
      await onSave(d, rule?.id);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button onClick={onClose} className="px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-100 rounded">
        Cancelar
      </button>
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3a6b] text-white rounded text-[13px] font-medium hover:bg-[#243d6b] disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {isNew ? "Crear" : "Guardar"}
      </button>
    </>
  );

  return (
    <Modal open title={isNew ? "Nueva regla" : `Editar: ${rule?.name}`} onClose={onClose} footer={footer} maxWidth="max-w-xl">
      <Field label="Nombre">
        <TextInput value={d.name ?? ""} onChange={(e) => set({ name: e.target.value })}
                   placeholder="ej: Detecta interés en Diploma Parlamentaria" />
      </Field>
      <Field label="Descripción (opcional)">
        <TextInput value={d.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Pattern (regex, case-insensitive)">
        <TextArea
          value={d.pattern ?? ""}
          onChange={(e) => set({ pattern: e.target.value })}
          rows={3}
          className="font-mono text-[12px]"
          placeholder="(?i)gesti[oó]n\s*parlamentari|diploma.*parlamentari"
        />
      </Field>
      <Field
        label="Tag a aplicar"
        hint="Usá namespace: interés:, sector:, pago:, intent:, consulta:, cliente:"
      >
        <TextInput value={d.tag ?? ""} onChange={(e) => set({ tag: e.target.value })}
                   placeholder="interés:diploma-parlamentaria" />
      </Field>

      <div className="flex items-center gap-4">
        <Field label="Weight">
          <TextInput type="number" step="0.1" min="0" max="5" className="w-24"
                     value={d.weight ?? 1.0}
                     onChange={(e) => set({ weight: parseFloat(e.target.value) || 1.0 })} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] mt-5">
          <input type="checkbox" checked={d.enabled ?? true} onChange={(e) => set({ enabled: e.target.checked })} />
          Activa
        </label>
      </div>

      {error && <div className="text-[12px] text-red-600 bg-red-50 p-2 rounded">{error}</div>}
    </Modal>
  );
}
