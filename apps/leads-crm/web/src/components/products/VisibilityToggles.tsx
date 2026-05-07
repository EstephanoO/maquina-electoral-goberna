import { Star, Eye } from "lucide-react";
import type { ProductDraft } from "../../types/product";

type Props = { draft: ProductDraft; onChange: (patch: Partial<ProductDraft>) => void };

export function VisibilityToggles({ draft, onChange }: Props) {
  return (
    <div className="flex gap-3 pt-2">
      <Toggle
        checked={draft.featured ?? false}
        onChange={(featured) => onChange({ featured })}
        icon={<Star size={14} />}
        label="Destacado (flyer activo)"
      />
      <Toggle
        checked={draft.enabled ?? true}
        onChange={(enabled) => onChange({ enabled })}
        icon={<Eye size={14} />}
        label="Habilitado"
      />
    </div>
  );
}

type ToggleProps = { checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; label: string };
function Toggle({ checked, onChange, icon, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {icon} {label}
    </label>
  );
}
