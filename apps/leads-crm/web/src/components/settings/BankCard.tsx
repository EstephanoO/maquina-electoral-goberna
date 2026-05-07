import { Star, Edit2, Trash2 } from "lucide-react";
import type { BankAccount } from "../../types/config";

type Props = {
  bank: BankAccount;
  onEdit: () => void;
  onDelete: () => void;
};

export function BankCard({ bank, onEdit, onDelete }: Props) {
  return (
    <div className={`rounded-lg border p-4 bg-white ${bank.is_default ? "border-amber-300" : "border-slate-200"}`}>
      <header className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-slate-900 flex items-center gap-2">
          {bank.is_default && <Star className="w-4 h-4 text-amber-500" fill="currentColor" />}
          {bank.name}
        </h4>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono bg-slate-50 p-2 rounded max-h-32 overflow-y-auto">
        {bank.body}
      </pre>
      {bank.yape_numero && (
        <div className="text-xs text-slate-500 mt-2">Yape: <span className="font-mono">{bank.yape_numero}</span></div>
      )}
    </div>
  );
}
