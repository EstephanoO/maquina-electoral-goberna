import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Modal } from "../Modal";
import { Field, TextInput, TextArea } from "../forms/Field";
import { useToast } from "../../toast";
import type { BotInstance } from "../../types/config";

type Props = {
  instance: BotInstance | null;
  onClose: () => void;
  onSave: (id: number, patch: Partial<BotInstance>) => Promise<unknown>;
};

export function InstanceEditor({ instance, onClose, onSave }: Props) {
  const toast = useToast();
  const [d, setD] = useState<Partial<BotInstance>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setD(instance ?? {}); }, [instance]);

  if (!instance) return null;
  const set = (p: Partial<BotInstance>) => setD(prev => ({ ...prev, ...p }));

  async function save() {
    if (!instance) return;
    setSaving(true);
    try { await onSave(instance.id, d); toast("Configuración guardada", "ok"); onClose(); }
    catch (e: any) { toast(`Error: ${e.message}`, "err"); }
    finally { setSaving(false); }
  }

  const footer = (
    <>
      <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">
        Cancelar
      </button>
      <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
        <Save size={16} /> {saving ? "Guardando…" : "Guardar"}
      </button>
    </>
  );

  return (
    <Modal open title={`Editar ${instance.slug}: ${instance.display_name}`} onClose={onClose} footer={footer}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Slug (id corto)">
          <TextInput value={d.slug ?? ""} onChange={(e) => set({ slug: e.target.value })} placeholder="p4" />
        </Field>
        <Field label="Display name">
          <TextInput value={d.display_name ?? ""} onChange={(e) => set({ display_name: e.target.value })} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone (con +)">
          <TextInput value={d.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="+51944531711" />
        </Field>
        <Field label="Yape número">
          <TextInput value={d.yape_numero ?? ""} onChange={(e) => set({ yape_numero: e.target.value })} placeholder="944531711" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre del agente">
          <TextInput value={d.agent_name ?? ""} onChange={(e) => set({ agent_name: e.target.value })} placeholder="Kathy" />
        </Field>
        <Field label="Firma del agente">
          <TextInput value={d.agent_signature ?? ""} onChange={(e) => set({ agent_signature: e.target.value })} placeholder="Kathy Asesora de Goberna" />
        </Field>
      </div>

      <Field label="Cuenta bancaria (texto multilinea — el bot envía este texto cuando piden medios de pago)">
        <TextArea
          value={d.cuenta_bancaria ?? ""}
          onChange={(e) => set({ cuenta_bancaria: e.target.value })}
          rows={6}
          className="font-mono text-xs"
          placeholder="🏫 ESCUELA GOBERNA EIRL&#10;BCP: 1939936368051&#10;Yape: 944531711"
        />
      </Field>

      <Field label="Prompt extra (concatenado al system prompt cuando responde con esta instancia)">
        <TextArea
          value={d.extra_prompt ?? ""}
          onChange={(e) => set({ extra_prompt: e.target.value })}
          rows={4}
          placeholder="Eres Kathy, asesora cálida y directa de Goberna…"
        />
      </Field>

      <Field label="Notas internas (no se envía al lead)">
        <TextArea value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
      </Field>

      <div className="flex gap-4 pt-2 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.enabled ?? true} onChange={(e) => set({ enabled: e.target.checked })} />
          Activo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.auto_reply ?? false} onChange={(e) => set({ auto_reply: e.target.checked })} />
          Auto-reply ON ⚠️
        </label>
      </div>
    </Modal>
  );
}
