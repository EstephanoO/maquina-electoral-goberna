import type { Rule } from "../../types/training";
import { RuleRow } from "./RuleRow";

type Props = {
  rules: Rule[];
  onToggle: (r: Rule) => void;
  onEdit: (r: Rule) => void;
  onDelete: (r: Rule) => void;
};

export function RulesTable({ rules, onToggle, onEdit, onDelete }: Props) {
  if (rules.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-[13px] bg-white rounded-lg border border-slate-200">
        Sin reglas todavía. Tocá "Nueva regla" para crear la primera.
      </div>
    );
  }

  return (
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
          {rules.map(r => (
            <RuleRow key={r.id} r={r} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
