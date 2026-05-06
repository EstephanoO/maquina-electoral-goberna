import { useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { Field, TextArea } from "../../forms/Field";
import { usePromptOverride } from "../../../hooks/usePromptOverride";

const CONTEXT_PLACEHOLDER = `Ej:
Goberna Escuela vende diplomas online de consultoría política, oratoria, marketing político.
Productos vivos: Diploma Gestión Parlamentaria (jun-2026), Análisis de Inteligencia (jul-2026).
Formas de pago: BCP, Interbank, Yape (944531711).`;

const CATEGORIES_PLACEHOLDER = `tema_legal
tema_marketing
consulta_modalidad
requiere_factura`;

const FEWSHOT_PLACEHOLDER =
  '[{"input": "quiero el diploma de parlamentaria", "output": {"category": "diploma-parlamentaria", "vote_class": "duro", "confidence": 0.9}}]';

export function PromptTab() {
  const { prompt, form, setForm, loading, save } = usePromptOverride();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading || !prompt) return <div className="p-6 text-center text-slate-400">Cargando…</div>;

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function onSave() {
    setError(null); setSaving(true);
    try { await save(); setSavedAt(Date.now()); setTimeout(() => setSavedAt(null), 2000); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-sm font-bold text-slate-800 mb-1">Configuración del Prompt IA</h2>
      <p className="text-xs text-slate-500 mb-4">
        Lo que escribas se concatena al system prompt base que recibe Gemini. Útil para contexto del negocio
        (cursos vivos, métodos de pago, vocabulario de Goberna Escuela).
      </p>

      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <Field label="Contexto extra (qué debe saber Gemini sobre tu negocio)">
          <TextArea
            value={form.extra_context} onChange={(e) => set({ extra_context: e.target.value })}
            rows={6} className="font-mono" placeholder={CONTEXT_PLACEHOLDER}
          />
        </Field>

        <Field label="Categorías custom (una por línea)">
          <TextArea
            value={form.extra_categories} onChange={(e) => set({ extra_categories: e.target.value })}
            rows={4} className="font-mono" placeholder={CATEGORIES_PLACEHOLDER}
          />
        </Field>

        <Field label="Few-shot examples (JSON array)" hint="Pares (input, output) que entrenan a Gemini con casos reales del negocio.">
          <TextArea
            value={form.few_shot_json} onChange={(e) => set({ few_shot_json: e.target.value })}
            rows={8} className="font-mono text-[12px]" placeholder={FEWSHOT_PLACEHOLDER}
          />
        </Field>

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Override habilitado
        </label>

        {error && <div className="text-[12px] text-red-600 bg-red-50 p-2 rounded">{error}</div>}

        <footer className="flex items-center gap-3 pt-2">
          <button
            onClick={onSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3a6b] text-white rounded text-[13px] font-medium hover:bg-[#243d6b] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
          {savedAt && <span className="text-[12px] text-emerald-600">Guardado ✓</span>}
          {prompt.updated_at && (
            <span className="text-[11px] text-slate-400 ml-auto">
              Última edición: {new Date(prompt.updated_at).toLocaleString("es-PE")}
              {prompt.updated_by ? ` · ${prompt.updated_by}` : ""}
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
