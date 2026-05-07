import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Modal } from "../Modal";
import { ProductBasicFields } from "./ProductBasicFields";
import { PaymentFields } from "./PaymentFields";
import { ClassifierFields } from "./ClassifierFields";
import { VisibilityToggles } from "./VisibilityToggles";
import { useToast } from "../../toast";
import type { Product, ProductDraft } from "../../types/product";
import { validateRegex } from "../../hooks/useProducts";

type Props = {
  draft: ProductDraft | null;
  onClose: () => void;
  onSave: (draft: ProductDraft) => Promise<unknown>;
};

export function ProductFormModal({ draft, onClose, onSave }: Props) {
  const toast = useToast();
  const [local, setLocal] = useState<ProductDraft>(draft ?? {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(draft ?? {}); }, [draft]);

  if (!draft) return null;

  const editing = local as Product;
  const set = (patch: Partial<ProductDraft>) => setLocal((d) => ({ ...d, ...patch }));

  async function save() {
    if (!local.nombre?.trim()) { toast("Nombre obligatorio", "err"); return; }
    const regexErr = validateRegex(local.classifier_pattern);
    if (regexErr) { toast(`Regex inválido: ${regexErr}`, "err"); return; }
    setSaving(true);
    try {
      await onSave(local);
      toast(local.id ? "Producto actualizado" : "Producto creado", "ok");
      onClose();
    } catch (e: any) {
      toast(`Error: ${e.message}`, "err");
    } finally {
      setSaving(false);
    }
  }

  const title = local.id ? `Editar: ${editing.nombre}` : "Nuevo producto";
  const footer = (
    <>
      <button onClick={onClose} disabled={saving} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">
        Cancelar
      </button>
      <button
        onClick={save}
        disabled={saving || !local.nombre?.trim()}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        <Save size={16} /> {saving ? "Guardando…" : "Guardar"}
      </button>
    </>
  );

  return (
    <Modal open title={title} onClose={onClose} footer={footer}>
      <ProductBasicFields draft={local} onChange={set} />
      <PaymentFields draft={local} onChange={set} />
      <ClassifierFields draft={local} onChange={set} />
      <VisibilityToggles draft={local} onChange={set} />
    </Modal>
  );
}
