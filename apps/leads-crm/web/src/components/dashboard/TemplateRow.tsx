export type TemplateRowData = {
  id: number;
  name: string;
  category?: string;
  uses_count?: number;
};

export function TemplateRow({ t }: { t: TemplateRowData }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
      <div className="text-xs text-slate-400 font-mono w-8 text-right">{t.uses_count || 0}</div>
      <div className="flex-1 text-sm text-slate-700 truncate">{t.name.replace(/_/g, " ")}</div>
      {t.category && (
        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{t.category}</span>
      )}
    </div>
  );
}
