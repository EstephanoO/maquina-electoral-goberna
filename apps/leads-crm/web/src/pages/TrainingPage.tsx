/**
 * TrainingPage — UI de entrenamiento del classifier del bot.
 *
 * Tabs:
 *   • Reglas — CRUD regex → tag, con preview de hits
 *   • Prompt — singleton: contexto + categorías + few-shot examples para Gemini
 *   • Sandbox — pegás texto, ves qué tags aplicarían (programmatic + custom)
 *
 * Backend:
 *   GET    /ai/rules
 *   POST   /ai/rules
 *   PATCH  /ai/rules/:id
 *   DELETE /ai/rules/:id
 *   GET    /ai/prompt
 *   PATCH  /ai/prompt
 *   POST   /ai/test-classify
 */

import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import { cn } from "../lib/utils";
import { Plus, Pencil, Trash2, Save, Power, FlaskConical, BookText, ClipboardList, Loader2 } from "lucide-react";

type Rule = {
  id: number;
  name: string;
  description: string | null;
  pattern: string;
  tag: string;
  weight: number;
  enabled: boolean;
  hits_count: number;
  last_hit_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type PromptOverride = {
  id: number;
  extra_context: string;
  extra_categories: string;
  few_shot_examples: Array<{ input: string; output: Record<string, unknown> }>;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
};

type Tab = "rules" | "prompt" | "sandbox";

export default function TrainingPage() {
  const [tab, setTab] = useState<Tab>("rules");

  return (
    <div className="flex flex-col h-full">
      {/* Tabs header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-1">
        <h1 className="text-base font-bold text-slate-800 mr-6">Entrenamiento del Bot</h1>
        <TabButton current={tab} value="rules" onClick={setTab} icon={<ClipboardList className="w-4 h-4" />} label="Reglas" />
        <TabButton current={tab} value="prompt" onClick={setTab} icon={<BookText className="w-4 h-4" />} label="Prompt IA" />
        <TabButton current={tab} value="sandbox" onClick={setTab} icon={<FlaskConical className="w-4 h-4" />} label="Sandbox" />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {tab === "rules" && <RulesTab />}
        {tab === "prompt" && <PromptTab />}
        {tab === "sandbox" && <SandboxTab />}
      </div>
    </div>
  );
}

function TabButton({ current, value, onClick, icon, label }: {
  current: Tab; value: Tab; onClick: (v: Tab) => void; icon: React.ReactNode; label: string;
}) {
  const active = current === value;
  return (
    <button onClick={() => onClick(value)}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors",
        active ? "bg-[#1a3a6b] text-white" : "text-slate-600 hover:bg-slate-100"
      )}>
      {icon}{label}
    </button>
  );
}

// ── RULES TAB ────────────────────────────────────────────────────────

function RulesTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Rule[]>("/ai/rules");
      setRules(data);
    } catch (e: any) {
      console.error("load rules:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onToggle = async (r: Rule) => {
    await api.patch(`/ai/rules/${r.id}`, { enabled: !r.enabled });
    void load();
  };

  const onDelete = async (r: Rule) => {
    if (!confirm(`Eliminar regla "${r.name}"?`)) return;
    await api.del(`/ai/rules/${r.id}`);
    void load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Reglas de clasificación</h2>
          <p className="text-xs text-slate-500 mt-1">
            Cuando un mensaje matchea el regex, el bot agrega la tag al lead. Cambios surten efecto en ~1 min (cache 60s).
          </p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a3a6b] text-white rounded-md text-[13px] font-medium hover:bg-[#243d6b]">
          <Plus className="w-4 h-4" />Nueva regla
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />Cargando…
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left w-8"></th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left">Pattern</th>
                <th className="px-3 py-2 text-left">Tag</th>
                <th className="px-3 py-2 text-right">Hits</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={cn("border-t border-slate-100 hover:bg-slate-50", !r.enabled && "opacity-50")}>
                  <td className="px-3 py-2">
                    <button onClick={() => onToggle(r)} title={r.enabled ? "Desactivar" : "Activar"}>
                      <Power className={cn("w-4 h-4", r.enabled ? "text-emerald-500" : "text-slate-300")} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    {r.description && <div className="text-[11px] text-slate-500">{r.description}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600 max-w-md truncate" title={r.pattern}>
                    {r.pattern}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">{r.tag}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{r.hits_count}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(r)} className="p-1 hover:bg-slate-200 rounded" title="Editar">
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button onClick={() => onDelete(r)} className="p-1 hover:bg-red-100 rounded" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rules.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-[13px]">
              Sin reglas todavía. Tocá "Nueva regla" para crear la primera.
            </div>
          )}
        </div>
      )}

      {(editing || creating) && (
        <RuleEditor
          rule={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); void load(); }}
        />
      )}
    </div>
  );
}

function RuleEditor({ rule, onClose, onSaved }: { rule: Rule | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !rule;
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [tag, setTag] = useState(rule?.tag ?? "");
  const [weight, setWeight] = useState(rule?.weight ?? 1.0);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (!name || !pattern || !tag) { setError("Nombre, pattern y tag son obligatorios"); return; }
    try { new RegExp(pattern); } catch (e: any) { setError(`Regex inválido: ${e.message}`); return; }
    setSaving(true); setError(null);
    try {
      const body = { name, description, pattern, tag, weight, enabled };
      if (isNew) await api.post("/ai/rules", body);
      else await api.patch(`/ai/rules/${rule.id}`, body);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-4">{isNew ? "Nueva regla" : `Editar: ${rule.name}`}</h3>

        <div className="space-y-3">
          <Field label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="ej: Detecta interés en Diploma Parlamentaria"
              className="w-full px-3 py-2 border border-slate-200 rounded text-[13px] focus:outline-none focus:border-blue-400" />
          </Field>
          <Field label="Descripción (opcional)">
            <input value={description ?? ""} onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-[13px] focus:outline-none focus:border-blue-400" />
          </Field>
          <Field label="Pattern (regex, case-insensitive)">
            <textarea value={pattern} onChange={(e) => setPattern(e.target.value)}
              placeholder="(?i)gesti[oó]n\s*parlamentari|diploma.*parlamentari"
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded text-[13px] font-mono focus:outline-none focus:border-blue-400" />
          </Field>
          <Field label="Tag a aplicar">
            <input value={tag} onChange={(e) => setTag(e.target.value)}
              placeholder="interés:diploma-parlamentaria"
              className="w-full px-3 py-2 border border-slate-200 rounded text-[13px] focus:outline-none focus:border-blue-400" />
            <p className="text-[11px] text-slate-500 mt-1">
              Usá namespace: <code>interés:</code>, <code>sector:</code>, <code>pago:</code>, <code>intent:</code>, <code>consulta:</code>, <code>cliente:</code>
            </p>
          </Field>
          <div className="flex items-center gap-4">
            <Field label="Weight">
              <input type="number" step="0.1" min="0" max="5" value={weight}
                onChange={(e) => setWeight(parseFloat(e.target.value) || 1.0)}
                className="w-24 px-3 py-2 border border-slate-200 rounded text-[13px]" />
            </Field>
            <label className="flex items-center gap-2 text-[13px] mt-5">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Activa
            </label>
          </div>

          {error && <div className="text-[12px] text-red-600 bg-red-50 p-2 rounded">{error}</div>}
        </div>

        <div className="flex gap-2 mt-6 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3a6b] text-white rounded text-[13px] font-medium hover:bg-[#243d6b] disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isNew ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-700 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── PROMPT TAB ────────────────────────────────────────────────────

function PromptTab() {
  const [prompt, setPrompt] = useState<PromptOverride | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [extraCategories, setExtraCategories] = useState("");
  const [fewShotJson, setFewShotJson] = useState("[]");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.get<PromptOverride>("/ai/prompt");
      setPrompt(p);
      setExtraContext(p.extra_context ?? "");
      setExtraCategories(p.extra_categories ?? "");
      setFewShotJson(JSON.stringify(p.few_shot_examples ?? [], null, 2));
      setEnabled(p.enabled);
    } catch {}
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setError(null);
    let fewShot;
    try {
      fewShot = JSON.parse(fewShotJson);
      if (!Array.isArray(fewShot)) throw new Error("debe ser un array");
    } catch (e: any) {
      setError(`Few-shot JSON inválido: ${e.message}`);
      return;
    }
    setSaving(true);
    try {
      await api.patch("/ai/prompt", {
        extra_context: extraContext,
        extra_categories: extraCategories,
        few_shot_examples: fewShot,
        enabled,
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
      void load();
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    }
    setSaving(false);
  };

  if (!prompt) return <div className="p-6 text-center text-slate-400">Cargando…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-sm font-bold text-slate-800 mb-1">Configuración del Prompt IA</h2>
      <p className="text-xs text-slate-500 mb-4">
        Lo que escribas se concatena al system prompt base que recibe Gemini. Útil para contexto del negocio
        (cursos vivos, métodos de pago, vocabulario de Goberna Escuela).
      </p>

      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <Field label="Contexto extra (qué debe saber Gemini sobre tu negocio)">
          <textarea value={extraContext} onChange={(e) => setExtraContext(e.target.value)}
            rows={6}
            placeholder={`Ej:\nGoberna Escuela vende diplomas online de consultoría política, oratoria, marketing político.\nProductos vivos: Diploma Gestión Parlamentaria (jun-2026), Análisis de Inteligencia (jul-2026).\nFormas de pago: BCP, Interbank, Yape (944531711).`}
            className="w-full px-3 py-2 border border-slate-200 rounded text-[13px] font-mono focus:outline-none focus:border-blue-400" />
        </Field>

        <Field label="Categorías custom (una por línea)">
          <textarea value={extraCategories} onChange={(e) => setExtraCategories(e.target.value)}
            rows={4}
            placeholder={`tema_legal\ntema_marketing\nconsulta_modalidad\nrequiere_factura`}
            className="w-full px-3 py-2 border border-slate-200 rounded text-[13px] font-mono focus:outline-none focus:border-blue-400" />
        </Field>

        <Field label="Few-shot examples (JSON array)">
          <textarea value={fewShotJson} onChange={(e) => setFewShotJson(e.target.value)}
            rows={8}
            placeholder='[{"input": "quiero el diploma de parlamentaria", "output": {"category": "diploma-parlamentaria", "vote_class": "duro", "confidence": 0.9}}]'
            className="w-full px-3 py-2 border border-slate-200 rounded text-[12px] font-mono focus:outline-none focus:border-blue-400" />
          <p className="text-[11px] text-slate-500 mt-1">Pares de ejemplos (input, output) que entrenan a Gemini con casos reales del negocio.</p>
        </Field>

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Override habilitado
        </label>

        {error && <div className="text-[12px] text-red-600 bg-red-50 p-2 rounded">{error}</div>}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3a6b] text-white rounded text-[13px] font-medium hover:bg-[#243d6b] disabled:opacity-50">
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
        </div>
      </div>
    </div>
  );
}

// ── SANDBOX TAB ─────────────────────────────────────────────────────

function SandboxTab() {
  const [text, setText] = useState("Hola, quiero información del Diploma de Gestión Parlamentaria. Puedo pagar por Yape?");
  const [result, setResult] = useState<{
    text: string;
    matched: Array<{ rule_id: number; rule_name: string; tag: string; weight: number }>;
    tags: string[];
    rules_checked: number;
  } | null>(null);
  const [running, setRunning] = useState(false);

  const onRun = async () => {
    if (!text.trim()) return;
    setRunning(true);
    try {
      const r = await api.post<typeof result>("/ai/test-classify", { text });
      setResult(r);
    } catch {}
    setRunning(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-sm font-bold text-slate-800 mb-1">Sandbox de clasificación</h2>
      <p className="text-xs text-slate-500 mb-4">
        Pegá un mensaje y ves qué tags aplicarían las reglas activas. No persiste nada — útil para validar antes de publicar reglas nuevas.
      </p>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Pegá acá el mensaje a clasificar…"
          className="w-full px-3 py-2 border border-slate-200 rounded text-[13px] focus:outline-none focus:border-blue-400" />

        <div className="flex justify-between items-center mt-3">
          <span className="text-[11px] text-slate-500">{text.length} caracteres</span>
          <button onClick={onRun} disabled={running || !text.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a3a6b] text-white rounded text-[13px] font-medium hover:bg-[#243d6b] disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            Clasificar
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-4 bg-white rounded-lg border border-slate-200 p-5">
          <div className="text-[11px] font-medium text-slate-500 uppercase mb-3">Resultado</div>
          <div className="text-[13px] mb-3">
            <span className="font-semibold">{result.tags.length}</span> tag{result.tags.length !== 1 ? "s" : ""} matchearon
            <span className="text-slate-400"> · {result.rules_checked} reglas revisadas</span>
          </div>

          {result.tags.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {result.tags.map((t) => (
                  <span key={t} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[12px] font-medium">{t}</span>
                ))}
              </div>
              <div className="text-[11px] font-medium text-slate-500 uppercase mb-2">Reglas que matchearon</div>
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase">
                  <tr>
                    <th className="px-2 py-1 text-left">Regla</th>
                    <th className="px-2 py-1 text-left">Tag</th>
                    <th className="px-2 py-1 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matched.map((m) => (
                    <tr key={m.rule_id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{m.rule_name}</td>
                      <td className="px-2 py-1.5"><code className="text-blue-600">{m.tag}</code></td>
                      <td className="px-2 py-1.5 text-right">{m.weight.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="text-[12px] text-slate-400 italic">Ninguna regla matcheó. Tocá Reglas y agregá patterns.</div>
          )}
        </div>
      )}
    </div>
  );
}
