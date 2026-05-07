import { useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { useBankAccounts } from "../../hooks/useConfig";
import { useToast } from "../../toast";
import { BankCard } from "./BankCard";
import { BankEditor } from "./BankEditor";
import type { BankAccount } from "../../types/config";

export function BanksConfig() {
  const toast = useToast();
  const { banks, loading, create, update, remove } = useBankAccounts();
  const [editing, setEditing] = useState<Partial<BankAccount> | null>(null);

  if (loading) return <div className="p-6 text-center text-slate-400">Cargando…</div>;

  async function save(id: number | undefined, b: Partial<BankAccount>) {
    if (id) await update(id, b); else await create(b);
  }

  async function handleDelete(b: BankAccount) {
    if (!confirm(`Borrar "${b.name}"?`)) return;
    try { await remove(b.id); toast("Cuenta eliminada", "ok"); }
    catch (e: any) { toast(`Error: ${e.message}`, "err"); }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            Cuentas bancarias ({banks.length})
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Datos de pago que el bot envía cuando un lead pregunta cómo pagar.
            La cuenta marcada como default se asigna automáticamente a productos nuevos.
          </p>
        </div>
        <button onClick={() => setEditing({})} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded">
          <Plus size={14} /> Nueva cuenta
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {banks.map(b => (
          <BankCard key={b.id} bank={b} onEdit={() => setEditing(b)} onDelete={() => handleDelete(b)} />
        ))}
      </div>

      <BankEditor bank={editing} onClose={() => setEditing(null)} onSave={save} />
    </div>
  );
}
