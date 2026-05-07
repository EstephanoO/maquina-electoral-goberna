import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Modal } from "../Modal";
import { Field, TextInput, TextArea } from "../forms/Field";
import { useToast } from "../../toast";
import type { BankAccount } from "../../types/config";

type Props = {
  bank: Partial<BankAccount> | null;
  onClose: () => void;
  onSave: (id: number | undefined, b: Partial<BankAccount>) => Promise<unknown>;
};

export function BankEditor({ bank, onClose, onSave }: Props) {
  const toast = useToast();
  const [d, setD] = useState<Partial<BankAccount>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setD(bank ?? {}); }, [bank]);
  if (!bank) return null;

  const set = (p: Partial<BankAccount>) => setD(prev => ({ ...prev, ...p }));

  async function go() {
    if (!d.name || !d.body) { toast("Nombre y body son obligatorios", "err"); return; }
    setSaving(true);
    try { await onSave(d.id, d); toast("Cuenta guardada", "ok"); onClose(); }
    catch (e: any) { toast(`Error: ${e.message}`, "err"); }
    finally { setSaving(false); }
  }

  const footer = (
    <>
      <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
      <button onClick={go} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
        <Save size={16} /> {saving ? "Guardando…" : "Guardar"}
      </button>
    </>
  );

  return (
    <Modal open title={d.id ? `Editar: ${d.name}` : "Nueva cuenta bancaria"} onClose={onClose} footer={footer}>
      <Field label="Nombre">
        <TextInput value={d.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Goberna BCP Soles" />
      </Field>

      <Field label="Body (texto multilinea — el bot envía esto al lead)">
        <TextArea
          value={d.body ?? ""}
          onChange={(e) => set({ body: e.target.value })}
          rows={8}
          className="font-mono text-xs"
          placeholder={`🏫 ESCUELA GOBERNA EIRL\nRUC: 20608310925\n🏦 BCP: 1939936368051\nCCI: 00219300993636805115`}
        />
      </Field>

      <Field label="Yape">
        <TextInput value={d.yape_numero ?? ""} onChange={(e) => set({ yape_numero: e.target.value })} placeholder="944531711" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.is_default ?? false} onChange={(e) => set({ is_default: e.target.checked })} />
        Marcar como default (se desmarcan las demás)
      </label>
    </Modal>
  );
}
