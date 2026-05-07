import type { ProductFilter } from "../../hooks/useProducts";

type Props = {
  value: ProductFilter;
  onChange: (v: ProductFilter) => void;
  featuredCount: number;
};

export function ProductFilterTabs({ value, onChange, featuredCount }: Props) {
  return (
    <div className="flex gap-2 mb-4">
      <Tab active={value === "featured"} onClick={() => onChange("featured")}>
        Destacados ({featuredCount})
      </Tab>
      <Tab active={value === "all"} onClick={() => onChange("all")}>
        Todos
      </Tab>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm ${active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}
