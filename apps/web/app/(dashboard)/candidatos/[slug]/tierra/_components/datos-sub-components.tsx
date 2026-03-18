/**
 * datos-sub-components.tsx — Small reusable sub-components for DatosView.
 *
 * Extracted from datos-view.tsx to keep the main component under 300 lines.
 */

type SortKey = "created_at" | "nombre" | "encuestador";

export function SortBtn({ label, sortKey, current, arrow, onSort, align }: { label: string; sortKey: SortKey; current: SortKey; arrow: (k: SortKey) => string; onSort: (k: SortKey) => void; align?: "center" | "right" }) {
  return (
    <button type="button" onClick={() => onSort(sortKey)}
      className={`text-[9px] font-bold uppercase tracking-wider cursor-pointer bg-transparent border-none transition-colors hover:text-slate-700 p-0 ${
        current === sortKey ? "text-slate-700" : "text-slate-400"
      } ${align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"}`}>
      {label}{arrow(sortKey)}
    </button>
  );
}

export function PagBtn({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-500 text-[13px] font-bold cursor-pointer flex items-center justify-center hover:bg-slate-50 hover:text-slate-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}

export function ActionBtn({ onClick, disabled, title, children, variant, style }: {
  onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
  variant?: "danger"; style?: React.CSSProperties;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={style}
      className={`w-7 h-7 rounded-lg border cursor-pointer flex items-center justify-center transition-colors disabled:opacity-25 ${
        variant === "danger"
          ? "border-red-200/80 bg-white text-red-400 hover:bg-red-50 hover:text-red-600"
          : "border-slate-200/80 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700"
      }`}>
      {children}
    </button>
  );
}
